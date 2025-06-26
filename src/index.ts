import cluster from "cluster";
import http from "http";  // Import HTTP module

import { Server } from "http";
import { CPUS_COUNT, PORT_NUMBER } from "./utils/constants";
import { customLogger, simpleLogger } from "./utils/helper";
import app from "./app";
import { setupSocket } from "./socket/socket";

export let server: Server | null;

if (cluster.isPrimary) {
    customLogger(`Master process ${process.pid} is running`, process.pid);

    for (let i = 0; i < CPUS_COUNT; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        customLogger(`Worker process ${worker.process.pid} died. Restarting...`, worker.process.pid);
        cluster.fork();
    });
} else {


    // Create an HTTP server and pass it to Socket.IO
    const server = http.createServer(app);

    // Initialize Socket.IO with the created server
    setupSocket(server);  // Setup the socket logic

    // Start the server
    server.listen(process.env.PORT || 3000, () => {
        console.log(`Server is running on port ${process.env.PORT || 3000}`);
    });
}
