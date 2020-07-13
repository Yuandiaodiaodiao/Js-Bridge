import fs from 'fs'
import path from 'path'
/**
 * 读取用户配置 获取用户配置文件夹下的文件列表
 * @param {Array} folder 
 */
export const handle_user_config = folder => {
  try {
    const user_config_files = fs.readdirSync(folder)
    return user_config_files
  } catch (error) {
    return []
  }
}

/**
 * 获取__internal__下的文件夹列表
 */
export const get_internal_libname = () => {
  try {
    const fileDir=path.resolve(__dirname,'..')
    const internamPath=path.resolve(fileDir,'src', '__internal__')
    const internal_config_dirs = fs.readdirSync(internamPath)
    return internal_config_dirs
  } catch (error) {
    return []
  }
}

/**
 * 
 * @param {String} libraryName 库名称
 * @param {String} configFolder 用户配置文件
 * @param {Object} opts 编译插件的state.opts
 * @returns {String} 手动拼的代码
 */
const build_mockjs = (libraryName, configFolder, opts) => {
  const { config_ifLog, config_ifMock, config_env } = opts
  //获取plugin项目 src文件夹的绝对路径
  const fileDir=path.resolve(__dirname,'..')
  //获取__internal__/库的路径
  const internalConfigPath = path.resolve(fileDir, "src",'__internal__', libraryName, config_env + '.js')
  //获取__config__/库的路径
  const userConfigPath = path.resolve(configFolder, libraryName, config_env + '.js')
  //获取src下的构建代码
  const buildCodePath = path.resolve(fileDir,"src" ,'buildCodeString.js')
  // console.log(`from ${internalConfigPath} \n ${userConfigPath} \n ${buildCodePath} \n build lib=${libraryName}`)
  let codeStr = ""
  //拼接出库的名字
  codeStr += `const nativeNameA="${libraryName.slice(0, 1)}"\nconst nativeNameB="${libraryName.slice(1)}"\n`
  //根据plugin-config拼接是否启用Log或mock
  codeStr += `const ifLog=${config_ifLog ? "true" : "false"}\nconst ifMock=${config_ifMock ? "true" : "false"}\n`

  if(!fs.existsSync(internalConfigPath) && !fs.existsSync(userConfigPath)){
    //两份配置文件都不存在对应的 不代理此包
    // console.log("都没有"+libraryName)
    return false
  }

  if (fs.existsSync(internalConfigPath)) {
    //默认配置文件
    const internalCode = fs.readFileSync(internalConfigPath,'utf8')
    codeStr += internalCode + "\n"
  } else {
    //没有默认配置文件开空变量
    codeStr += "const funcTemplete=[]\nconst mockDataFunc = {}\nconst logFunc={}\nconst packageFunc={}\n"
  }
  if (fs.existsSync(userConfigPath)) {
    //用户自定义文件
    const userCode = fs.readFileSync(userConfigPath,'utf8')
    codeStr += userCode + "\n"
  } else {
    //空自定义文件
    codeStr += "const funcTempleteCustomize=[]\nconst mockDataFuncCustomize = {}\nconst logFuncCustomize={}\nconst packageFuncCustomize = {}\n"
  }
  //合并 构建代码
  const buildCode = fs.readFileSync(buildCodePath,'utf8')
  codeStr += buildCode + "\n"
  //按包名导出
  codeStr += `export default mockFuncBuilded`
  return codeStr
}
/**
 * 合并用户配置 默认配置 与构建方法
 * @param {String} libraryName native库名称
 * @param {String} configFolder 用户配置文件
 * @param {Object} opts 编译插件的state.opts
 * @returns {String} 构建好的路径
 */
export const create_mockjs = (libraryName, configFolder, opts) => {
  const mockFolderPath = 'mockjs'
  const projectRelativePath=opts.config_mockjs_path||'src'
  const filePath=path.resolve(process.cwd(),projectRelativePath,mockFolderPath)
  //存放在项目目录/(用户配置文件路径 默认src)/mockjs/下面
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(filePath)
    console.log('创建路径' + filePath)
  }

  //生成代码的字符串
  const mockCode = build_mockjs(libraryName, configFolder, opts)
  if(mockCode===false){
    return false
  } 

  //libname前面拼个mock 当成生成的包名
  const mockLibPath = path.join(filePath, 'mock' + libraryName + '.js')
  fs.writeFileSync(mockLibPath, mockCode)
  return mockLibPath
}


/**
 * 合并用户输入和默认配置
 * @param {Object} user_config 
 */
export const merge_config = (user_config, name) => {
  const config = require(user_config)
  // console.log('用户内容:', config.default, user_config)
  const internal_config = require(path.resolve('src', '__internal__', name))
  // console.log('默认配置:', internal_config.default, user_config)
  const handle = {
    get: function (target, name) {
      name in target ? name : internal_config[name]
    }
  }
  const proxy = new Proxy(config, handle)
  console.log(proxy)
  return proxy
}

/**
 * 抽取babel plugin的用户配置文件 state.opts
 * @param {Object} state 
 */
export const get_config_folder = state => {
  const { config_folder } = state.opts
  return config_folder
}

export const ImportDeclarationMetaData = (path, state) => {
  const { specifiers, source } = path.node //当前节点 
  const libraryName = source.value
  const { config_folder } = state.opts
  // console.log('opts=' + JSON.stringify(state.opts))
  return {
    specifiers, //导入的变量声明
    libraryName, //库的路径
    config_folder,//插件选项?
  }
}

export const CallExpressionMetaData = (path, state) => {
  const { arguments: args } = path.node
  const value =args&&args[0]?args[0].value:undefined
  const callee = path.node.callee
  const { config_folder } = state.opts
 
  return {
    value,
    callee,
    config_folder
  }
}