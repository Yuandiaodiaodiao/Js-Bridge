import types from '@babel/types'
import { handle_user_config, ImportDeclarationMetaData, CallExpressionMetaData } from './util'
import fs from 'fs'
import p from 'path'
import { merge_config } from './util'
import { get_internal_libname, create_mockjs, get_config_folder } from './util'

/**
 * 
 * @param {String} config_folder state.opts.config_folder
 * 合并用户的__config__ 和内置的 __internal__ 如果有一方配置了某个库的mock 则视为可以mock
 * @returns {Set} libName String的集合
*/
function genSupportSet(config_folder) {
  let config_internal = get_internal_libname()
  if (config_folder) {
    //config兼容的libName Array
    const config_customize = handle_user_config(config_folder)
    //合并配置
    config_internal = config_internal.concat(config_customize)

  } else {
    // console.log('默认配置')
  }
  //Set去重
  return new Set(config_internal)
}
//缓存已经生成的mockjs路径 按照源包名进行索引
let libGenerated = {}
//清理缓存 用于test

/**
 * 
 * @param {String} libName 想要替换的库名称
 * @param {Object} state 遍历ast的state参数
 * @param {String} config_folder 用户配置文件中的 config_folder
 * @param {Function} callBack 确认可以进行替换时的回调
 */
function solveMockLib(libName, state, config_folder, callBack) {
  if (!config_folder) return
  const ignoreNodeModules=state.opts.ignore_nodemodules===false?false:true
  if (ignoreNodeModules&&state.filename &&state.filename.split(p.sep).indexOf('node_modules') !== -1) {
    // console.log(`jump --import--LibName=${libraryName} ${state.filename}`)
    return
  }
  let configSet = genSupportSet(config_folder)
  if (configSet.has(libName)) {
    //没缓存生成文件 有缓存直接替换
    if (!libGenerated[libName]) {
      //生成文件并保存
      let libPath = create_mockjs(libName, config_folder, state.opts)
      if(libPath===false){
        //生成失败
        return
      }
      libGenerated[libName] = libPath
      console.log('生成了库文件' + libPath)
    }
    //可以替换 调用回调
    callBack(libGenerated[libName])
  }
}

export default () => {
  console.log('babel-plugin-bridge start')
  //正常编译快应用会调用一次default()
  //test的时候会多次调用 保证每一次test缓存都会刷新
  libGenerated={}
  return {
    pre(state) {
      const plugin = state.opts.plugins.find(plugin => p.normalize(plugin.key) === p.normalize(__filename))
      if(plugin){
        //去掉pre函数 让插件启动log仅输出一次
        plugin.pre = undefined
      }
    },
    visitor: {
      ImportDeclaration: (path, state) => {

        const { specifiers, libraryName, config_folder }
          = ImportDeclarationMetaData(path, state)
        //处理
        // console.log(state.filename)
        // console.log(libraryName)
        solveMockLib(libraryName, state, config_folder,
          libPath => path.replaceWith(types.importDeclaration(specifiers, types.stringLiteral(libPath)))
        )
      },
      CallExpression: (path, state) => {
        //获取requier函数
        const { value, callee, config_folder } = CallExpressionMetaData(path, state)
        if (callee.name !== 'require') {
          //如果不是require退出
          return
        }
        solveMockLib(value, state, config_folder,
          libPath => {
            let calleeNode = types.callExpression(callee, [types.stringLiteral(libPath)])
            // path.replaceWith(calleeNode) 
            // require('@system.quick') => require('path+mock@system.quick')
            path.replaceWith(types.memberExpression(calleeNode, types.identifier('default')))
            // require('@system.quick') => require('path+mock@system.quick').default

          })
      },
    }
  }
}
