const path = require('path')
const babel = require('rollup-plugin-babel')
const typescript = require('rollup-plugin-typescript');
const DEFAULT_EXTENSIONS = require('@babel/core').DEFAULT_EXTENSIONS;
module.exports = {
  default: {
    input: path.resolve(__dirname, 'src', 'main.js'),
    output: {
      file: 'build/index.js',
      format: 'cjs'
    },
    external: [ '@babel/types','fs','path' ] ,
    plugins: [
      babel({
      presets: [
        [
          '@babel/preset-env',
          {
            targets: {
              node: 8 
            }
          }
        ],
      ],
    }),
  
  ]
  },
  bridge_handle: {

    input: path.resolve(__dirname, 'src', 'bridge_handle', 'index.ts'),
    output: {
      file: 'build/handle.js',
      format: 'cjs'
    },
    external: [ '@babel/types','fs','path','@babel/traverse','@babel/parser' ] ,
    plugins: [
      typescript({tsconfig:'tsconfig.json'}),
      babel({
        extensions: [
          ...DEFAULT_EXTENSIONS,
          '.ts',
          '.tsx'
        ],
        presets: [
          [
            '@babel/preset-env',
            {
              targets: {
                node: 8 
              }
            }
          ],
        ],
      })
    ]
  }
}