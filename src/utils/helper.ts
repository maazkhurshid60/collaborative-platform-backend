import { WHITE_LIST_DOMAINS } from "./constants";

// Custom Console Logger
export const customLogger = (message: string, ..._arguments: any) => {
    for (let index = 0; index < _arguments.length; index++) {
        console.log(`ARG ${index}: ${_arguments[index]}`);
    }
}

export const simpleLogger = (message: string) => {
    console.log(message);
}

export function checkWhiteListDomain(origin: any, callback: any) {
    if (WHITE_LIST_DOMAINS.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
    } else {
        callback(new Error('CORS ERROR'))
    }
}




