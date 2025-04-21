"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const cluster_1 = __importDefault(require("cluster"));
const http_1 = __importDefault(require("http")); // Import HTTP module
const constants_1 = require("./utils/constants");
const helper_1 = require("./utils/helper");
const app_1 = __importDefault(require("./app"));
const socket_1 = require("./socket/socket");
if (cluster_1.default.isPrimary) {
    (0, helper_1.customLogger)(`Master process ${process.pid} is running`, process.pid);
    for (let i = 0; i < constants_1.CPUS_COUNT; i++) {
        cluster_1.default.fork();
    }
    cluster_1.default.on('exit', (worker, code, signal) => {
        (0, helper_1.customLogger)(`Worker process ${worker.process.pid} died. Restarting...`, worker.process.pid);
        cluster_1.default.fork();
    });
}
else {
    // Create an HTTP server and pass it to Socket.IO
    const server = http_1.default.createServer(app_1.default);
    // Initialize Socket.IO with the created server
    (0, socket_1.setupSocket)(server); // Setup the socket logic
    // Start the server
    server.listen(process.env.PORT || 3000, () => {
        console.log(`Server is running on port ${process.env.PORT || 3000}`);
    });
}
