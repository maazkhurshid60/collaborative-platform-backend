"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simpleLogger = exports.customLogger = void 0;
exports.checkWhiteListDomain = checkWhiteListDomain;
const constants_1 = require("./constants");
// Custom Console Logger
const customLogger = (message, ..._arguments) => {
    for (let index = 0; index < _arguments.length; index++) {
        console.log(`ARG ${index}: ${_arguments[index]}`);
    }
};
exports.customLogger = customLogger;
const simpleLogger = (message) => {
    console.log(message);
};
exports.simpleLogger = simpleLogger;
function checkWhiteListDomain(origin, callback) {
    if (constants_1.WHITE_LIST_DOMAINS.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
    }
    else {
        callback(new Error('CORS ERROR'));
    }
}
