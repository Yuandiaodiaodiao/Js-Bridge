import app from '@system.app'
const funcTemplete = [
    "getInfo"

]
const mockDataFunc = {
    getInfo: () => {
        return {}
    },
  
}
const logFunc = {

}
const packageFunc = {


    getInfoV2(nativeFunc) {
        const getInfo = nativeFunc.sendIntent
        return function (opts) {
            getInfo(opts)
        }
    },
   
}