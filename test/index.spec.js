// index.test.js
import pluginTester from 'babel-plugin-tester'
import hyBridPlugin from '../build/index'
import path from 'path'
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from '@babel/generator';
import * as babel from '@babel/core';
import fs from 'fs';
const optionsCommon= {
  config_folder: path.resolve(__dirname, '__config__'),
  config_ifLog: true,
  config_ifMock: true,
  config_env: 'fortest',
  config_mockjs_path: './',
}

//babel的tester 输入code output 进行全文匹配 
//由于使用绝对路径 所以结果需要动态生成
pluginTester({
  plugin: hyBridPlugin,
  pluginName: 'babel-transform-miai-hybrid',
  title: 'snapshot test',
  pluginOptions: optionsCommon,
  endOfLine: 'lf',
  snapshot: false,
 
  tests: {
    'import-test': {
      code: `import app from "@system.app";`,
      output: `import app from "${path.resolve('mockjs','mock@system.app.js')}";`.replace(/\\/g,"\\\\"),
    },
    'require-test': {
      code: `const test = require("@system.app");`,
      output: `const test = require("${path.resolve('mockjs','mock@system.app.js')}")\n  .default;`.replace(/\\/g,"\\\\"),
    },
    'require-snapshots':{//require预览
        code: `const test = require("@system.app");`,
        snapshot: true,
    },
    'import-snapshots':{//import预览
      code: `import app from "@system.app";`,
      snapshot: true,
  }
  }
})

//实时编译=>require测试
test('run-mock-import',()=>{
  const fileName=path.join(__dirname, '__fixtures__','run-mock-import','code.js')

  
  //使用babel-core的编译功能将code.js编译为output.js
  const {code, map, ast}=babel.transformFileSync(fileName,{
    plugins:[[hyBridPlugin,optionsCommon]]
  })
  const output=path.join(__dirname, '__fixtures__','run-mock-import','output.js')
  fs.writeFileSync(output,code)

  //require引入文件 //暂未找到更好的办法引入
  let moduleX=require(output)

  //参考__config__/@system.app/fortest.js
  const result=moduleX.default.testMock()

  expect(result).toBe(true);

})