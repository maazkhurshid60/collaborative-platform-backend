// Importing Dot ENV file
import cors from "cors";
import dotenv from "dotenv";

//Security middleware imports 
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";

// Primary Imports
import cookieParser from 'cookie-parser';
import express from "express";

// Middlewares Imports 
import morganMiddleware from "../src/middlewares/morgan.middleware";
import { ALLOWED_HEADERS, ALLOWED_METHODS } from "./utils/constants";
// Routers Imports
import healthCheckRouter from "./route/healthCheck/healthCheck.route";
import authRouter from "./route/auth/auth.route";
import clientRouter from "./route/client/client.route";
import providerRouter from "./route/provider/provider.route";
import chatRouter from "./route/chat/chat.route";
import chatChannelRouter from "./route/chatChannel/chatChannel.route";
import chatGroupRouter from "./route/chatGroup/chatGroup.route";
import { authJWT } from "./middlewares/auth.middleware";
import documentRouter from "./route/document/document.route";


// Declaration of Express App
const app = express();

dotenv.config(
    {
        path: ".env"
    }
);

//helmet
app.use(helmet())

// Rate limitter middleware: to limit request from same api
const limitter = rateLimit({
    max: 100000,
    windowMs: 60 * 60 * 1000,
    message: "Too many requests from this IP please try again in an hour",
    validate: true,
});

// Apply CORS policy


app.use(cors({
    origin: "*",
    credentials: true,
    methods: ALLOWED_METHODS, // Add all allowed methods
    allowedHeaders: ALLOWED_HEADERS, // Include any headers that are expected in requests
}));

app.options("*", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.sendStatus(204);
});

// xss-clean middleware to protect against XSS attacks
//prevent parameter pollution
app.use(hpp())

// Applying Middlewares to Express App
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morganMiddleware);

app.use("/api", limitter)

// Routers Imports
app.use("/api/v1/health", healthCheckRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/client", authJWT, clientRouter);
app.use("/api/v1/provider", authJWT, providerRouter);
app.use("/api/v1/chat", authJWT, chatRouter);
app.use("/api/v1/chat-channel", authJWT, chatChannelRouter);
app.use("/api/v1/chat-channel", authJWT, chatChannelRouter);
app.use("/api/v1/chat-group", authJWT, chatGroupRouter);
app.use("/api/v1/document", authJWT, documentRouter);

export default app;
