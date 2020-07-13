const regFun = (fun, logfun) => {

    return function (...args) {
        let result
        let err
        const startDate = Date.now()
        let endDate
        try {
            //接口不存在 或者native方法抛出的错误统一扔到log处理
            result = fun.call(this, ...args)
            endDate = Date.now()
        } catch (e) {
            err = e
            // console.log(' error at' + funcName)
        }
        if (logfun) {
            try {
                logfun.call(this, args, result, err, { start: startDate, end: endDate }) //log
            } catch (e) { }
        }
        return result
    }
}

const buildMock = function (nativeNameA, nativeNameB, funcTemplete, mockDataFunc, logFunc, packageFunc, ifLog, ifMock) {
    let nativeFunc

    if (!ifLog) logFunc = {}
    if (!ifMock) {
        mockDataFunc = {}
        try {
            nativeFunc = $app_require$(`@app-module/${nativeNameB}`)
            // nativeFunc = require(nativeName) 这种方式无法引入
        } catch (e) {
        }
    }
    const mockFunc = {}
    for (let funcName of funcTemplete) {
        if (nativeFunc && !ifMock) {
            //通过native方法构建接口
            mockFunc[funcName] = regFun(nativeFunc[funcName], logFunc[funcName])
        } else {
            //通过自定义mockData构建接口
            mockFunc[funcName] = regFun(mockDataFunc[funcName], logFunc[funcName])
        }

    }
    for (let funcName in packageFunc) {
        mockFunc[funcName] = packageFunc[funcName](mockFunc)
    }
    return mockFunc
}

const funcTempleteUnique = Array.from(new Set(funcTemplete.concat(funcTempleteCustomize)))

const mockDataFuncProxy = new Proxy(mockDataFuncCustomize, {
    get(target, key) {
        return target[key] || mockDataFunc[key]
    }
})
const logFuncProxy = new Proxy(logFuncCustomize, {
    get(target, key) {
        return target[key] || logFunc[key]
    }
})
const packageFuncProxy = new Proxy(packageFuncCustomize, {
    get(target, key) {
        return target[key] || packageFunc[key]
    }
})
//打包生成函数

//打包
const mockFuncBuilded = buildMock(nativeNameA, nativeNameB,
    funcTempleteUnique, mockDataFuncProxy, logFuncProxy, packageFuncProxy,
    ifLog, ifMock)