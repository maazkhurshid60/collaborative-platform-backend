import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import express from "express";
import path from "path";

import { ALLOWED_HEADERS, ALLOWED_METHODS } from "./utils/constants";
import morganMiddleware from "./middlewares/morgan.middleware";
import { authJWT } from "./middlewares/auth.middleware";

import healthCheckRouter from "./route/healthCheck/healthCheck.route";
import authRouter from "./route/auth/auth.route";
import clientRouter from "./route/client/client.route";
import providerRouter from "./route/provider/provider.route";
import chatRouter from "./route/chat/chat.route";
import chatChannelRouter from "./route/chatChannel/chatChannel.route";
import chatGroupRouter from "./route/chatGroup/chatGroup.route";
import documentRouter from "./route/document/document.route";
import notificationRouter from "./route/notification/notification.route";
import invitationEmailRouter from "./route/invitationEmail/invitationEmail.route";
import publicChatRouter from "./route/chat/public.chat.route";
import superAdminRouter from "./route/admin/superAdmin.route";
import providerInviteRouter from "./route/invitationEmail/providerInvite.routes"

const app = express();
app.set("trust proxy", 1);

app.use(helmet());

// General rate limit: 100,000 requests per hour for all API routes
const limitter = rateLimit({
  max: 100000,
  windowMs: 60 * 60 * 1000,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests from this IP please try again in an hour",
    });
  },
  validate: true,
  skip: (req) => req.originalUrl.includes('/webhook'),
});

// Strict rate limit: 10 requests per hour for auth routes (signup/login)
const authLimitter = rateLimit({
  max: 1000,
  windowMs: 60 * 60 * 1000,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too Many Request Please Try again later",
    });
  },
  validate: true,
});

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://collaborative-platform-frontend.vercel.app",
  "https://www.collaborateme.com",
  "https://collaborateme.com",
  "https://app.kolabme.com"
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
  })
);

app.options("*", cors());

app.use(hpp());

app.use(cookieParser());
import subscriptionRouter from "./route/subscription/subscription.route";

// ... previous imports

// Skip express.json for stripe webhooks so we can parse the raw body
app.use((req, res, next) => {
  if (req.originalUrl.includes('/webhook')) {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));
app.use(morganMiddleware);

app.use("/api", limitter);
app.use("/api/v1/auth", authLimitter);

app.use("/uploads/docs", authJWT, express.static(path.join(__dirname, "..", "uploads/docs")));

// ... static files

app.use("/api/v1/health", healthCheckRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/client", clientRouter);

app.use("/api/v1/provider", authJWT, providerRouter);
app.use("/api/v1/chat", authJWT, chatRouter);
app.use("/api/v1/public-chat", publicChatRouter);
app.use("/api/v1/chat-channel", authJWT, chatChannelRouter);
app.use("/api/v1/chat-group", authJWT, chatGroupRouter);
app.use("/api/v1/document", authJWT, documentRouter);
app.use("/api/v1/notification", authJWT, notificationRouter);
app.use("/api/v1/invite", authJWT, invitationEmailRouter);
app.use("/api/v1/individual-invites", authJWT, providerInviteRouter);
app.use("/api/v1/subscription", subscriptionRouter); // Added Subscription Router

app.use("/api/v1/super-admin", authJWT, superAdminRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

export default app;
