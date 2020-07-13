// import QbhWebpackPlugin from './qbh-webpack-plugin'
import BuildCompiler from './BuildCompiler'
// import WatchCompiler from './WatchCompiler'

// export {
//   QbhWebpackPlugin, BuildCompiler, WatchCompiler
// }
export default () => {
  const buildCompiler = new BuildCompiler()
  const visitor = buildCompiler.genvisitor()
  return {
    pre(state) {
      buildCompiler.cacheVersion()
      buildCompiler.constructorWithLock(state, __filename)
      buildCompiler.importList = []
    },
    visitor: visitor,
    post(state) {
      if (buildCompiler.ifVersionChanged()) {
        //最终版本号没有变化就不写入文件 防止循环watch编译 
        // console.log("写入")
        buildCompiler.writeManifest()
      }
    }
  }
}