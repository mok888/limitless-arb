import fs from 'fs';


export const init = (filename, initData = {}) => {
    if (!fs.existsSync(filename)) {
        fs.writeFileSync(filename, JSON.stringify(initData, null, 2), 'utf-8');
    }
}

export const set = (filename, key, value) => {
    if (!fs.existsSync(filename)) {
        init(filename);
    }
    const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    data[key] = value;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf-8');
}

export const get = (filename, key = null) => {
    if (!fs.existsSync(filename)) {
        init(filename);
    }
    const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));

    if (!key) return data

    return data[key];
}
