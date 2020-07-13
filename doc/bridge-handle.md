
## bridge-handle
解决快应用hybrid开发中的问题：
1. native接口信息收集--主要是收集module，和依赖native app 的版本号
2. native接口对应app版本分析--打包时根据使用native module的情况，分析出rpk依赖apk的最低版本，并体现在manifest中

## install



## 功能:native接口对应app版本分析
### 处理思路
1.首先记录各模块各函数的最低apk版本号需求  
2.通过编译插件分析哪些模块的哪些函数被使用了  
3.对被使用的函数依赖版本求max 得出当前rpk依赖的apk版本号  
### 功能介绍
能够一定程度上的分析当你import/require一个包的时候 跟踪内部的函数是否有被使用  
仅限于很初步的赋值   
无法分析跨模块的使用   
也没办法在你把包传进函数之后继续追踪  
能够追踪到的使用方法如下 注:如果搞不清楚一律按使用了整个模块来计算版本号
```js
import x from "@system.app"
import * as x from '@system.app'
import {getInfo as x} from '@system.app'
x.getInfo()
let a=x;
a=x
a.getInfo();
export default x;
export default {x};
let {getInfo}=x;
({getInfo:a}=x);
let x=require('@system.app')
require('@system.app').getInfo()
x=require('@system.app')
let a=x
a.getInfo()
a['getInfo']()
```
### 引入方法
本插件内置了一份版本文件,见versionBridge.ts  
而用户如果想自行添加新的依赖版本可以参考以下两种方式
#### 版本格式1
版本信息的格式如下 版本号需要为 "x.x.x"
```js
{
   "@system.app": {
        getInfo: '4.3.0',
    },
}
```
通过在babel.config.js 引入versionFile或者versionObject 来将json文件或者Object合并到默认配置文件中  
```js
      ["包名/build/handle.js",
        { versionFile: require('path').resolve('src', 'source-version.json'),
        versionObject:{}//可以自己导入Object
        }
      ],
```

在babel中配置api_version
```js
 ["包名/build/handle.js",{ api_version:require('path').resolve('src', 'api-version.json')}],
```
### 编译之后
编译之后将最低版本信息写入./src/manifest.json 格式如下  
```js
{
   "data": {
    "grayConfigPublishInfo": {
      "appInfos": [
        {
          "pkg": "com.miui.voiceassist",
          "versionType": "BLACK",
          "versionList": [
            {
              "left": 1,
              "right": 305999999
            }
          ]
        }
      ]
    }
  }
}
```

### ts的处理方案
在webpack中使用babel-loader替换ts的转换器来处理ts  
并在babel-loader的插件中加入此插件 顺序为ts生成js后立刻交由此插件处理
### webpack-plugin兼容方案
项目中的模块BuildCompiler.compile实现了处理单文件的编译    
通过初始化BuildCompiler对象并将编译函数插入到合适的webpack编译流程中  


