import morgan from "morgan";
import logger from "../utils/logger";

// Custom morgan format
const morganFormat = ':remote-addr :method :url :status :res[content-length] - :response-time ms';

export default morgan(morganFormat as any, {
    stream: {
        write: (message) => {
            // Only log in development or for errors in production
            if (process.env.NODE_ENV !== 'production') {
                logger.info(message.trim());
            } else {
                // In production, only log errors and slow requests
                const parts = message.trim().split(' ');
                const status = parseInt(parts[3]);
                const responseTime = parseFloat(parts[parts.length - 2]);
                
                if (status >= 400 || responseTime > 1000) {
                    logger.warn(message.trim());
                }
            }
        },
    },
    // Skip logging for health checks and static files
    skip: (req, res) => {
        if (!req.url) return false;
        return req.url.includes('/health') || 
               req.url.includes('/uploads') ||
               req.url.includes('favicon.ico');
    }
});
