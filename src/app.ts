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

const limitter = rateLimit({
  max: 100000,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests from this IP please try again in an hour",
  validate: true,
});

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "https://collaborative-platform-frontend.vercel.app",
  "https://www.collaborateme.com",
  "https://collaborateme.com",
  "https://app.kolabme.com/"
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morganMiddleware);

app.use("/api", limitter);

app.use("/uploads/docs", express.static(path.join(__dirname, "..", "uploads/docs")));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads"), {
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      const origin = res.req.headers.origin as string | undefined;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    },
  })
);

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

app.use("/api/v1/super-admin", authJWT, superAdminRouter);

export default app;
