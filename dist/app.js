"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Importing Dot ENV file
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
//Security middleware imports 
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const hpp_1 = __importDefault(require("hpp"));
// Primary Imports
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_1 = __importDefault(require("express"));
// Middlewares Imports 
const constants_1 = require("./utils/constants");
// Routers Imports
const healthCheck_route_1 = __importDefault(require("./route/healthCheck/healthCheck.route"));
const auth_route_1 = __importDefault(require("./route/auth/auth.route"));
const client_route_1 = __importDefault(require("./route/client/client.route"));
const provider_route_1 = __importDefault(require("./route/provider/provider.route"));
const chat_route_1 = __importDefault(require("./route/chat/chat.route"));
const chatChannel_route_1 = __importDefault(require("./route/chatChannel/chatChannel.route"));
const chatGroup_route_1 = __importDefault(require("./route/chatGroup/chatGroup.route"));
const auth_middleware_1 = require("./middlewares/auth.middleware");
const document_route_1 = __importDefault(require("./route/document/document.route"));
const morgan_middleware_1 = __importDefault(require("./middlewares/morgan.middleware"));
const path_1 = __importDefault(require("path"));
// Declaration of Express App
const app = (0, express_1.default)();
app.set('trust proxy', 1);
dotenv_1.default.config({
    path: ".env"
});
//helmet
app.use((0, helmet_1.default)());
// Rate limitter middleware: to limit request from same api
const limitter = (0, express_rate_limit_1.default)({
    max: 100000,
    windowMs: 60 * 60 * 1000,
    message: "Too many requests from this IP please try again in an hour",
    validate: true,
});
// Apply CORS policy
app.use((0, cors_1.default)({
    origin: "*",
    credentials: true,
    methods: constants_1.ALLOWED_METHODS, // Add all allowed methods
    allowedHeaders: constants_1.ALLOWED_HEADERS, // Include any headers that are expected in requests
}));
app.options("*", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.sendStatus(204);
});
// Serve uploaded documents statically
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "..", "uploads")));
// app.use('/uploads/docs', express.static(path.join(__dirname, '..', 'uploads/docs')));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '..', 'uploads'), {
    setHeaders: (res, filePath) => {
        console.log("Serving file:", filePath); // <== ADD THIS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));
// xss-clean middleware to protect against XSS attacks
//prevent parameter pollution
app.use((0, hpp_1.default)());
// Applying Middlewares to Express App
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use(morgan_middleware_1.default);
app.use("/api", limitter);
// Routers Imports
app.use("/api/v1/health", healthCheck_route_1.default);
app.use("/api/v1/auth", auth_route_1.default);
app.use("/api/v1/client", client_route_1.default);
app.use("/api/v1/provider", auth_middleware_1.authJWT, provider_route_1.default);
app.use("/api/v1/chat", auth_middleware_1.authJWT, chat_route_1.default);
app.use("/api/v1/chat-channel", auth_middleware_1.authJWT, chatChannel_route_1.default);
app.use("/api/v1/chat-channel", auth_middleware_1.authJWT, chatChannel_route_1.default);
app.use("/api/v1/chat-group", auth_middleware_1.authJWT, chatGroup_route_1.default);
app.use("/api/v1/document", auth_middleware_1.authJWT, document_route_1.default);
exports.default = app;
