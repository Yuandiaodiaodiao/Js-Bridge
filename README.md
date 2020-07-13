# 快应用mock js-bridge
## 开发  
npm run build    
npm run watch   

## 版本号统计
版本号统计的文档在 ./doc/bridge-handle.md

## 配置
babel-plugin配置
- pluginOptions:
``` javascript
{
    config_folder: "用户配置文件path",//必须设置! 空文件夹__config__也行
    config_ifLog:true, //开启log
    config_ifMock:true, //开启mock
    config_env:'release', //对应配置文件的release.js 
    config_mockjs_path:'./src/',//生成mockjs的路径 如果不配置 默认为process.cwd()/src/
}
```
- 构建生成:  
   构建结束的文件会被写入 项目根目录/src/mockjs/  
   文件命名 "mock"+原包名
- 注意:  
   在生成mock之后导出的部分为 export default mockFuncBuilded
   项目会忽略node_module里的native模块!!! 
   
# 兼容ts方案
ux文件似乎会跟着babel.config走
ts文件在hap.config.js里配置babel-loader对.ts进行处理
在@babel/plugin-transform-typescript后进行import替换
注意 在修改mock配置文件后 要刷新webpack缓存
使用cacheDirectory:false
具体刷新方法为在nodemodule里面找到hap-tookit然后全局搜索cacheDirectory
```javascript
{
        test: /\.ts$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              plugins: [
                "@babel/plugin-transform-typescript",
                ["module:../plugin-transform-miai-hybrid", {
                  config_folder: require('path').resolve('src', '__config__'),
                  config_ifLog: true,
                  config_ifMock: true,
                  config_env: 'build',
                  config_mockjs_path: './src/',
                  ignore_nodemodules,
                }],
              ]
            },
          },
        ],
        include: /src/,
      },
```

# 流程图
![流程图](./doc/项目介绍.png)
其中右侧的getter按需打包暂时未实现 在引入时就生成了所有的func并cache   
若需要使用右侧的方案需要分析好每个封装接口的依赖链  

# 技术方案
## sdk要解决的问题
封装快应用框架提供的native接口
来进行mock 和log 
## 解决思路
通过babel编译插件 将封装 mock log 拆分为单独的配置文件.  
在生产环境和开发环境可以切换不同的配置文件,这样开发环境的log,mock不会被打包进生产环境.  
用户可以直接使用native接口
```javascript
import bridge from "@system.app"
```
而编译插件会按照配置的环境变量进行替换,将native接口,与log,计时,mock,封装函数等等功能按需求封装为一个新函数提供给用户.  
从用户层面看来,业务逻辑的代码中只需要调用接口,获取结果.  
而错误处理,打点上报,全部在配置文件里声明.  

### 内置接口
可以出一些预设配置文件 将现有的对native接口的封装打包进去

### 用户自定义
用户通过自己配置的config文件即可添加新的native接口或者封装  
比如想要把native接口的getInfo,封装为getInfoV2  
只需要在用户配置文件中的packageFuncCustomize中添加
```javascript
    function getInfo(nativeFunc){
        const oriFunc=nativeFunc.sendIntent//在这里选择被封装的函数
        return function(...args){
            console.log('getInfoV2  封装'+oriFunc(args))
        }
    }
```
在运行时return出来的func就会成为getInfoV2  

## 使用方法
首先在 babel-plugin下配置config_folder 如 ./src/config  
然后比如需要配置@system.app的mock
需要在目录下建立文件夹@system.app  
然后根据babel-plugin插件配置中的config_env
建立对应的${config_env}.js 文件  
文件模板由4部分构成  
```js
const funcTempleteCustomize=[]
const mockDataFuncCustomize = {}
const logFuncCustomize={}
const packageFuncCustomize = {}
```
- funcTempleteCustomize:  
  Array 描述native接口应有的functionName 如:    
  const funcTempleteCustomize=['getInfo']  
- mockDataFuncCustomize  
  <functionName,function> 传入native方法的参数 输出你想mock的内容  
- logFuncCustomize
  <functionName,function> 传入args,result,err,{ start: startDate, end: endDate } 分别为native方法的参数 native方法的结果 调用native方法时产生的报错 和客户端接口计时  
  start和end为 Date.now()对象  
- packageFuncCustomize  
  <functionName,function>  function结构需要如下  
  将getInfo封装为getInfoV2
```js 
     getInfoV2(nativeFunc) {//nativFunc为当前native包的所有客户端方法的集合
     //你可以理解为带有mock和log的nativeFunc对象<funcName,func>
     //通过闭包保存当前使用到的nativeFunc
         const getInfo=nativeFunc.getInfo
            return function (fn) { //返回的函数为新封装的函数 这里为getInfoV2
                let ans=getInfo(fn)
                //这里做要封装的事情
                return ans
             }
     }
```
  packageFunc是为了更方便的拓展客户端接口  
  你可以使用同样的functionName来完全覆盖一个接口  
  也可以将一个客户端接口封装为另外一个  
  也可以自己实现一个新的客户端接口(这个插件理论上也可以操作快应用原生的各种native包)  
  在npm包内的__internal__里已经实现了一部分的mock(可以作为参考)  
  用户自定义的mock部分将和__internal__的配置进行合并 同时优先使用客户端的配置  