import traverse from "@babel/traverse";
import generate from "@babel/generator";
import { parse } from "@babel/parser";
import {
  isImportDefaultSpecifier, isImportSpecifier, isImportNamespaceSpecifier,
  isAssignmentExpression, isVariableDeclarator, isMemberExpression,
  isExportDefaultSpecifier, isExportNamespaceSpecifier, isExportSpecifier, isIdentifier, isObjectPattern, isProperty, isObjectExpression, isObjectProperty
} from '@babel/types';
import * as fs from 'fs'
const _ = require('lodash');
import * as path from 'path'
const filewalker = require("filewalker")
import { fmtVersion } from './fmtVersion'
import versionBridge from "./versionBridge"
type ImportList = {
  name: string,
  source: string
}


export default class BuildCompiler {
  bridgeVersions = {}
  minVersion = '0.0.0'
  rpkMinVersion = '0.0.0'
  versionNameStr = '__version'
  cachedVersion = '0.0.0'
  initLock: boolean = false //因为babel每个文件都执行pre函数 所以要加锁只初始化一次
  importList: Array<ImportList> = [] //符号表
  fileName = ""
  constructor() {
    this.rpkMinVersion = this.getVersionCodeV2(this.rpkMinVersion)
    this.getSourceVersionsV2()
  }
  cacheVersion() {
    this.cachedVersion = this.rpkMinVersion
  }
  ifVersionChanged() {
    return this.cachedVersion !== this.rpkMinVersion
  }
  constructorWithLock(state, pluginPath) {
    this.fileName = state
    if (this.initLock) return
    console.log("JS Bridge version-handle启动")
    this.initLock = true
    const plugin = state.opts.plugins.find(plugin => path.normalize(plugin.key) === path.normalize(pluginPath))
    //移除pre函数
    // plugin.pre = undefined
    if (plugin.options.versionFile) {
      let json = fs.readFileSync(plugin.options.versionFile, 'utf8')
      try {
        const action = this.addSourceVersionsFromJson(JSON.parse(json))
        if (action) {
          console.log(`load sourceVersion from${plugin.options.versionFile} success`)
        }
      } catch (error) {
      }

    }
    if (plugin.options.versionObject) {
      const action = this.addSourceVersionsFromJson(plugin.options.versionObject)
      if (action) {
        console.log(`load sourceVersion from versionJson success`)
      }
    }
    if (plugin.options.api_version) {
      let json = fs.readFileSync(plugin.options.api_version, 'utf8')
      try {
        const action = this.addSourceVersionsFromApiVersion(JSON.parse(json))
        if (action) {
          console.log(`load sourceVersion from${plugin.options.api_version} success`)
        }
      } catch (error) {
      }
    }
  }
  addSourceVersionsFromApiVersion(json) {
    try {
      json.forEach(methodObject => { //第一层 取出每个native方法中的函数集合
        let version = methodObject.since
        if (!(Number(version) > 1e6)) {
          version = this.getVersionCodeV2(version)
        }
        _.set(this.bridgeVersions, [methodObject.module, methodObject.name], version)
      })
      return true
    } catch (error) {
    }
  }
  /**
   * 
   * @param json 从json里添加用户自定义版本号
   */
  addSourceVersionsFromJson(json) {
    try {
      _.forEach(json, (methodObject, index) => { //第一层 取出每个native方法中的函数集合
        _.forEach(methodObject, (version, methodname) => {//第二层 取出每个函数的版本号
          _.set(this.bridgeVersions, [index, methodname], this.getVersionCodeV2(version))
        })
      })
      return true
    } catch (error) {
    }
  }
  /**
   * 从versionBridge.ts内部获取函数版本
   */
  getSourceVersionsV2() {
    this.bridgeVersions = _.cloneDeep(versionBridge) || {}
    _.forEach(this.bridgeVersions, (methodObject, index, collection) => { //第一层 取出每个native方法中的函数集合
      _.forEach(methodObject, (version, methodname) => {//第二层 取出每个函数的版本号
        methodObject[methodname] = this.getVersionCodeV2(version)
      })
      if (!_.sample(methodObject)) {//空集合删掉
        delete collection[index]
      }
    })
  }
  /**
   * 计算客户端版本号
   * @param str x.x.x的版本号
   */
  getVersionCodeV2(str: string = this.minVersion): string {
    return fmtVersion(str) + "" //新的计算版本号方法
  }

  /**
   * 
   * @param moduleName 模块名
   */
  solveModuleUsed(moduleName: string) {
    if (this.bridgeVersions[moduleName] && _.sample(this.bridgeVersions[moduleName])) {//有包 并且有元素 (如果是空对象_.max出来的东西不好处理)
      const maxVersionFromModule = _.max(Object.values(this.bridgeVersions[moduleName]), version => Number(version)) //把一个native模块里的所有版本号都拿出来取max
      this.rpkMinVersion = `${Math.max(Number(maxVersionFromModule), Number(this.rpkMinVersion))}`//更新当前的max
      delete this.bridgeVersions[moduleName] //更新之后版本号就取max了 没必要继续监控了
      const printStr = `使用了${moduleName}: ${maxVersionFromModule} 当前版本号为${this.rpkMinVersion}`
      console.log(printStr)
    }

  }
  solveMethodUsed(moduleName: string, methodName: string) {
    const bridgeMethodVersion = _.get(this.bridgeVersions, [moduleName, methodName], 0) //按照 module.method 获取版本号
    if (!bridgeMethodVersion) return
    this.rpkMinVersion = `${Math.max(Number(bridgeMethodVersion), Number(this.rpkMinVersion))}`
    const deleteComplete = _.unset(this.bridgeVersions, [moduleName, methodName]) //移除module.method 增加性能
    if (deleteComplete) {
      const printStr = `使用了${moduleName}.${methodName}: ${bridgeMethodVersion} 当前版本号为${this.rpkMinVersion}`
      console.log(printStr)
    }
  }
  /**
   * 生成ast的visitor 这样既可以给babel用也可以给webpack用
   */
  visitorCore(){
    let self=this
    return{
      //import a from "b"
      // Program: { //刷新缓存交给babel的pre(){}
      //   enter: (path, state) => {
      //     //新的文件 刷新缓存
      //     console.log(state.filename)
      //     self.importList = []
      //   }
      // },
      ImportDeclaration: {
        enter: (path) => {

          const node = path.node
          let bridgeName: string = _.get(node, 'source.value', '')
          if (!self.bridgeVersions[bridgeName]) return
          //是需要统计的native库
          node.specifiers.forEach(specifier => {
            if (isImportDefaultSpecifier(specifier) || isImportNamespaceSpecifier(specifier)) {
              //import a from b || import * as a from b
              const item: ImportList = {
                name: _.get(specifier, 'local.name'), //被导出的string //一个文件一次ast所以被import导出的一定是全局变量
                source: bridgeName
              }
              self.importList.push(item) //记录符号
              // console.log(`import ${item.name} from ${bridgeName}`)
            } else if (isImportSpecifier(specifier)) {
              //import {a} from b || import {a as b} from c
              const bridgeMethod = _.get(specifier, 'imported.name') //按方法引入了 就当他已经使用了
              self.solveMethodUsed(bridgeName, bridgeMethod)
            }
          })
        }
      },
      CallExpression: {
        enter: (path) => {
          const node = path.node
          let bridgeCalleeName = _.get(node, 'callee.name') //函数调用的标识符
          // try {
          //   console.log('js callee', path.node.callee.name || path.node.callee.property.name)
          // } catch (e) {

          // }
          if (bridgeCalleeName === 'require' || bridgeCalleeName === '$app_require$') {
            //$app_require$是某种奇葩写法 不过有效 和直接使用require一样 区别是require的native会被快应用编译为$app_require$
            let requireModule: string = _.get(node, ['arguments', 0, 'value'], '') //取require()的第一个传入参数
            if (bridgeCalleeName === '$app_require$') { //对于使用$app_require$的奇葩引入
              requireModule = requireModule.replace('app-module/', '')
            }
            if (requireModule in self.bridgeVersions) { //使用require 引入的包
              const parentNode = path.parentPath.node //查看require的父级都做了什么
              if (isAssignmentExpression(parentNode)) {
                //a=require('b')
                const leftVarName = _.get(parentNode, 'left.name')
                self.importList.push({
                  name: leftVarName,
                  source: requireModule
                })
              } else if (isVariableDeclarator(parentNode)) {
                //let a=require('b')
                const idVarName = _.get(parentNode, 'id.name')
                self.importList.push({
                  name: idVarName,
                  source: requireModule
                })
              } else if (isMemberExpression(parentNode)) {
                //require('a').b || require('a')['b']
                const memberVarName = isIdentifier(parentNode.property) ? parentNode.property.name : parentNode.property.value
                self.solveMethodUsed(requireModule, memberVarName)
              } else {
                //引入进来做一些奇奇怪怪的操作 就当全使用了
                // console.log(requireModule, bridgeCalleeName, parentNode.type, parentNode.callee, path.parentPath.parentPath.node
                //   , path.parentPath.parentPath.parentPath.node
                //   , path.parentPath.parentPath.parentPath.parentPath)
                self.solveModuleUsed(requireModule)
              }
            }
          }
          node.arguments.forEach(arg => {//模块被当成参数传走了 标记为全使用
            if (isIdentifier(arg)) {
              let bridgeIdentifier = self.importList.find(v => v.name === arg.name)
              bridgeIdentifier && self.solveModuleUsed(bridgeIdentifier.source)
            }
          })
        }
      },
      ExportNamedDeclaration: {
        enter: (path) => {
          const node = path.node
          let bridgeName: string = _.get(node, 'source.value', '')
          if (bridgeName in self.bridgeVersions) { //是需要统计的native库
            node.specifiers.forEach(specifier => {
              if (isExportNamespaceSpecifier(specifier) || isExportDefaultSpecifier(specifier)) {
                // export x from '@b';  export * as x from '@b'; 导出了我也找不到到底用没用了 就当全都使用了
                self.solveModuleUsed(bridgeName)
              } else if (isExportSpecifier(specifier)) {
                //export {a as c} from '@b';  把a计算进去 || export {c}
                const bridgeMethod = _.get(specifier, 'local.name') //按方法引入了 就当他已经使用了
                self.solveMethodUsed(bridgeName, bridgeMethod)
              }
            })
          }
          if (node.specifiers && !node.source) { //没有source说明是直接导出的变量
            //export {x};
            node.specifiers.forEach(specifier => {
              if (!isExportSpecifier(specifier)) return
              const bridgeVar = _.get(specifier, 'local.name')
              let bridgeIdentifier = self.importList.find(v => v.name === bridgeVar)
              //只export了变量 那就看这个变量在不在符号表里
              if (bridgeIdentifier) {
                self.solveModuleUsed(bridgeIdentifier.source)
              }

            }
            )
          }
        }
      },
      ExportAllDeclaration: {//export * from '@b';
        enter: (path) => {
          const node = path.node
          let bridgeName: string = _.get(node, 'source.value', '')
          if (bridgeName in self.bridgeVersions) { //是需要统计的native库
            self.solveModuleUsed(bridgeName)
          }
        }
      },
      ExportDefaultDeclaration: {
        enter: (path) => {
          const node = path.node
          const declarationNode = node.declaration
          if (isIdentifier(declarationNode)) {
            //export default x;
            let bridgeIdentifier = self.importList.find(v => v.name === declarationNode.name)
            if (bridgeIdentifier) {
              self.solveModuleUsed(bridgeIdentifier.source)
            }
          }
          //else if (isObjectExpression(declarationNode)) {
          //打包对象导出
          //export default {x,c};
          //这里的逻辑会被ObjectExpression处理好
          //}
        }
      },
      MemberExpression: {
        enter: (path) => {
          //进行函数call之前 肯定要a.b 再()  所以直接获取MemberExpression看有没有从native模块中取出某个函数
          const node = path.node
          const objectNode = node.object
          if (!isIdentifier(objectNode)) return //左侧不是标识符 不处理
          let bridgeIdentifier = self.importList.find(v => v.name === objectNode.name)//查找是否是标记的变量
          if (bridgeIdentifier) {
            const propertyNode = node.property
            let bridgeMethod = isIdentifier(propertyNode) ? propertyNode.name : propertyNode.value //方法名 使用.为isIdentifier.name 使用[]为Literal.value
            self.solveMethodUsed(bridgeIdentifier.source, bridgeMethod)
            // console.log(Object.keys(path))
          }
        }
      },
      AssignmentExpression: {// a=b || ({a}=b)
        //赋值和变量初始化的逻辑很相似 考虑重构
        enter: (path) => {
          const node = path.node
          const rightNode = node.right
          const leftNode = node.left
          if (node.operator !== '=' || !isIdentifier(rightNode)) return //只处理赋值+标识符
          //右值为标识符 是赋值等式
          let bridgeIdentifier = self.importList.find(v => v.name === rightNode.name)
          if (!bridgeIdentifier) return //右值不是我们关注的变量
          if (isIdentifier(leftNode)) {
            //传给了一个变量
            self.importList.push({
              name: leftNode.name,
              source: bridgeIdentifier.source
            })
          } else if (isObjectPattern(leftNode)) {
            //解构赋值
            leftNode.properties.forEach(propertyNode => {
              if (isProperty(propertyNode) && isIdentifier(propertyNode.key)) {
                const patternKey = propertyNode.key.name
                self.solveMethodUsed(bridgeIdentifier.source, patternKey)
              }
            })
          }
          else {
            //传给数组?传给对象?那就监视不到了 认为是全部使用
            self.solveModuleUsed(bridgeIdentifier.source)
          }


        }
      },
      VariableDeclarator: {//let a=b ; let {a}=b
        enter: (path) => {
          const node = path.node
          const nodeInit = node.init
          if (!isIdentifier(nodeInit)) return
          let bridgeIdentifier = self.importList.find(v => v.name === nodeInit.name)
          if (!bridgeIdentifier) return //右边不是期待的变量
          //看看左边
          const nodeId = node.id
          if (isIdentifier(nodeId)) {
            //单个变量的声明
            self.importList.push({
              name: nodeId.name,
              source: bridgeIdentifier.source
            })
          } else if (isObjectPattern(nodeId)) {
            //解构
            nodeId.properties.forEach(propertyNode => {
              if (isProperty(propertyNode) && isIdentifier(propertyNode.key)) {
                let patternKey = propertyNode.key.name
                self.solveMethodUsed(bridgeIdentifier.source, patternKey)
              }
            })
          } else {
            //未知 就当全用了
            self.solveModuleUsed(bridgeIdentifier.source)
          }
        }
      },
      ObjectExpression: {//被打包进其他方法里了 肯定是使用过了let b= {'1':x}
        enter: (path) => {
          const node = path.node
          node.properties.forEach((property) => {
            if (isObjectProperty(property) && isIdentifier(property.value)) {
              let valueVarName = property.value.name
              let bridgeIdentifier = self.importList.find(v => v.name === valueVarName)
              if (bridgeIdentifier) {
                self.solveModuleUsed(bridgeIdentifier.source)
              }
            }
          })
        }
      }
    }
  }
  genvisitor() {
    let self = this
    return {
      Program: {
        enter: (path) => {
          // console.log("program in handle")
          traverse(_.get(path,"hub.file.ast"), self.visitorCore())
        },
      },
    }

  }
  /**
   * 支持 import a from '@b'
   * import * as a from '@b'
   * import {a as c} from '@b'
   * let x=require('@b')
   * x=require('@b')
   * require('@b').a()
   * @param filePath 文件路径
   */
  compile(filePath) {
    console.log(`start compile${filePath}`)
    const self = this
    let sourceCode: string = fs.readFileSync(filePath, 'utf8')
    const scriptRule = /<script[^>]*>([\s\S]*?)<\/[^>]*script>/gi
    let scriptsSource = sourceCode;
    if (filePath.endsWith(".ux") || filePath.endsWith(".vue")) {
      try {
        scriptsSource = scriptRule.exec(sourceCode)[1]
      } catch (error) {
        return
      }
    }
    // console.log(scriptsSource,'scriptsSource')
    const ast = parse(scriptsSource, { sourceType: "module" });

    traverse(ast, self.genvisitor())
  }
  writeManifest() {
    const mPath = path.join('./', 'src', 'manifest.json')
    const str = fs.readFileSync(mPath, 'utf8')
    const config = JSON.parse(str)
    const self = this
    const appInfos = [
      {
        "versionList": [{
          left: 1,
          right: Number(self.rpkMinVersion) - 1
        }]
      }
    ]
    _.set(config, 'data.appInfos', appInfos)
    const outputStr = JSON.stringify(config, null, 2)
    if (str !== outputStr) {
      fs.writeFileSync(mPath, outputStr)
    }
  }
  async buildComplie(absolute_path) {
    await this.getSourceVersionsV2()
    let cachedVersion = this.rpkMinVersion
    filewalker(absolute_path).on("file", (relative, stats, absolute) => {
      // if (absolute.endsWith(".ux")||absolute.endsWith(".js")){
      //     buildCompiler.compile(absolute);
      // }
      if (absolute.endsWith(".ux") || absolute.endsWith(".js") || absolute.endsWith(".vue")) {
        this.compile(absolute);
      }
    }).on('done', () => {
      console.log('快应用依赖版本', this.rpkMinVersion);
      if (cachedVersion !== this.rpkMinVersion) {
        this.writeManifest()
      }
    }).walk();
  }
}