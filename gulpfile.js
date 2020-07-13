const gulp = require('gulp')
const { watch } = require('gulp')
const rollup = require('rollup');
const config = require('./rollup.config')
const bridge_handle = config.bridge_handle
const babel_plugin_aife_aqa_bridge = config.default

console.log(bridge_handle)
console.log(babel_plugin_aife_aqa_bridge)

gulp.task('build', async function () {
    const bundle = await rollup.rollup(babel_plugin_aife_aqa_bridge);
    const bridge_handle_bundle = await rollup.rollup(bridge_handle);

    await bundle.write(babel_plugin_aife_aqa_bridge.output);
    await bridge_handle_bundle.write(bridge_handle.output)
});
gulp.task('watch', async function () {
    const watcher = rollup.watch(bridge_handle)
    watcher.on('event', event => {
        switch(event.code){
            case 'END':
                console.log('Finished build bridge_handle')
        }
        // event.code 会是下面其中一个：
        //   START        — 监听器正在启动（重启）
        //   BUNDLE_START — 构建单个文件束
        //   BUNDLE_END   — 完成文件束构建
        //   END          — 完成所有文件束构建
        //   ERROR        — 构建时遇到错误
        //   FATAL        — 遇到无可修复的错误
    });
    const watcher2= rollup.watch(babel_plugin_aife_aqa_bridge)
    watcher2.on('event', event => {
        switch(event.code){
            case 'END':
                console.log('Finished build babel_plugin_aife_aqa_bridge')
        }
    });

})