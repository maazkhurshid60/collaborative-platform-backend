import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
const { combine, timestamp, json, colorize } = format;

// Custom format for console logging with colors
const consoleLogFormat = format.combine(
    format.colorize(),
    format.printf(({ level, message, timestamp }) => {
        return `${level}: ${message}`;
    })
);

// File format without colors
const fileLogFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
);

// Daily rotate file transport for regular logs
const fileRotateTransport = new DailyRotateFile({
    filename: 'logs/app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '10m', // 10MB max file size
    maxFiles: '7d', // Keep logs for 7 days
    format: fileLogFormat,
    level: 'info'
});

// Daily rotate file transport for error logs
const errorFileRotateTransport = new DailyRotateFile({
    filename: 'logs/error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '10m',
    maxFiles: '14d', // Keep error logs for 14 days
    format: fileLogFormat,
    level: 'error'
});

// Create a Winston logger
const logger = createLogger({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    format: fileLogFormat,
    transports: [
        new transports.Console({
            format: consoleLogFormat,
            level: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
        }),
        fileRotateTransport,
        errorFileRotateTransport
    ],
    // Don't exit on handled exceptions
    exitOnError: false
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

export default logger;
