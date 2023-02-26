const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('./modules').map(dir => {
    return {
        filename: path.join('./modules', dir, "package.json"),
        type: 'json'
    };
});

module.exports = {
    packageFiles: files,
    bumpFiles: files
}
