import fs from 'fs';

export const sleep = (timeout) => {
    return new Promise(resolve => {
        setTimeout(resolve, timeout)
    })
}


// 取随机整数，[start, end]
export const getRandomInt = (min, max) => {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min
}

export const getRandomFloat = (min, max) => {
  // toFixed(2) 保留两位小数
  return (Math.random() * (max - min) + min).toFixed(2);
}

/**
 * 取随机浮点数，[min, max)
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} - 随机浮点数
 */
export const randFloat = (min, max) => {
    return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}


export const getFileContent = (filepath) => {
    const str = fs.readFileSync(filepath, 'utf-8')
    return str.split(/[(\r\n)\r\n]+/).filter((el) => el);
}