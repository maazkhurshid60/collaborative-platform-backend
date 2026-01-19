import cluster from "cluster";
import http from "http";
import { Server } from "http";
import app from "./app";
import { setupSocket } from "./socket/socket";
import logger from "./utils/logger";

export let server: Server | null;


const shouldUseCluster = process.env.NODE_ENV === 'production' && process.env.USE_CLUSTER !== 'false';
const workerCount = process.env.WORKER_COUNT ? parseInt(process.env.WORKER_COUNT) : Math.min(require('os').cpus().length, 4);

if (shouldUseCluster && cluster.isPrimary) {
    logger.info(`Master process ${process.pid} is running with ${workerCount} workers`);


    for (let i = 0; i < workerCount; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        logger.warn(`Worker process ${worker.process.pid} died with code ${code} and signal ${signal}. Restarting...`);
        cluster.fork();
    });


    process.on('SIGTERM', () => {
        logger.info('Master received SIGTERM, shutting down gracefully');
        for (const id in cluster.workers) {
            cluster.workers[id]?.kill();
        }
    });

} else {
    const server = http.createServer(app);
    
    // Initialize Socket.IO with the created server
    setupSocket(server);
    
    const PORT = process.env.PORT || 3000;
    
    // Start the server
    server.listen(PORT, () => {
        const processInfo = shouldUseCluster ? `Worker ${process.pid}` : `Single process ${process.pid}`;
        logger.info(`🚀 ${processInfo} - Server running on port ${PORT}`);
    });

    // Graceful shutdown for worker process
    process.on('SIGTERM', () => {
        logger.info('Worker received SIGTERM, shutting down gracefully');
        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });
    });
}

