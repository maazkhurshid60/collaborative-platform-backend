// // Importing Dot ENV file
// import cors from "cors";
// import dotenv from "dotenv";

// //Security middleware imports
// import rateLimit from "express-rate-limit";
// import helmet from "helmet";
// import hpp from "hpp";

// // Primary Imports
// import cookieParser from "cookie-parser";
// import express from "express";

// // Middlewares Imports
// import { ALLOWED_HEADERS, ALLOWED_METHODS } from "./utils/constants";
// // Routers Imports
// import healthCheckRouter from "./route/healthCheck/healthCheck.route";
// import authRouter from "./route/auth/auth.route";
// import clientRouter from "./route/client/client.route";
// import providerRouter from "./route/provider/provider.route";
// import chatRouter from "./route/chat/chat.route";
// import chatChannelRouter from "./route/chatChannel/chatChannel.route";
// import chatGroupRouter from "./route/chatGroup/chatGroup.route";
// import { authJWT } from "./middlewares/auth.middleware";
// import documentRouter from "./route/document/document.route";
// import morganMiddleware from "./middlewares/morgan.middleware";
// import path from "path";
// import notificationRouter from "./route/notification/notification.route";
// import invitationEmailRouter from "./route/invitationEmail/invitationEmail.route";
// import publicChatRouter from "./route/chat/public.chat.route";
// import superAdminRouter from "./route/admin/superAdmin.route";


// // Declaration of Express App
// const app = express();
// app.set("trust proxy", 1);
// dotenv.config({
//   path: ".env",
// });

// //helmet
// app.use(helmet());

// // Rate limitter middleware: to limit request from same api
// const limitter = rateLimit({
//   max: 100000,
//   windowMs: 60 * 60 * 1000,
//   message: "Too many requests from this IP please try again in an hour",
//   validate: true,
// });

// // Apply CORS policy

// app.use(
//   cors({
//     origin: "*",
//     credentials: true,
//     methods: ALLOWED_METHODS, // Add all allowed methods
//     allowedHeaders: ALLOWED_HEADERS, // Include any headers that are expected in requests
//   }),
// );

// // app.options("*", (req, res) => {
// //   res.header("Access-Control-Allow-Origin", "*");
// //   res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
// //   res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
// //   res.sendStatus(204);
// // });


// // Apply CORS policy (FIXED for credentials/cookies)
// const allowedOrigins = [
//   "http://localhost:5173",
//   "http://127.0.0.1:5173",
//   "http://localhost:3000",
//   "https://collaborative-platform-frontend.vercel.app",
//   "https://www.collaborateme.com",
//   "https://collaborateme.com",
// ];

// app.use(
//   cors({
//     origin: (origin, callback) => {
//       // Allow requests with no origin (Postman, curl, server-to-server)
//       if (!origin) return callback(null, true);

//       if (allowedOrigins.includes(origin)) {
//         return callback(null, true);
//       }

//       return callback(new Error(`CORS blocked for origin: ${origin}`));
//     },
//     credentials: true,
//     methods: ALLOWED_METHODS,
//     allowedHeaders: ALLOWED_HEADERS,
//   })
// );

// // Proper preflight handling
// app.options("*", cors());

// // Serve uploaded documents statically
// app.use(
//   "/uploads/docs",
//   express.static(path.join(__dirname, "..", "uploads/docs")),
// );
// // app.use(
// //   "/uploads",
// //   express.static(path.join(__dirname, "..", "uploads"), {
// //     setHeaders: (res, filePath) => {
// //       res.setHeader("Access-Control-Allow-Origin", "*");
// //       res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
// //     },
// //   }),
// // );


// app.use(
//   "/uploads",
//   express.static(path.join(__dirname, "..", "uploads"), {
//     setHeaders: (res, filePath, stat) => {
//       res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

//       const origin = res.req.headers.origin as string | undefined;
//       if (origin && allowedOrigins.includes(origin)) {
//         res.setHeader("Access-Control-Allow-Origin", origin);
//         res.setHeader("Access-Control-Allow-Credentials", "true");
//       }
//     },
//   })
// );

// // xss-clean middleware to protect against XSS attacks
// //prevent parameter pollution
// app.use(hpp());

// // Applying Middlewares to Express App
// app.use(cookieParser());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(morganMiddleware);

// app.use("/api", limitter);

// // Routers Imports
// app.use("/api/v1/health", healthCheckRouter);
// app.use("/api/v1/auth", authRouter);
// app.use("/api/v1/client", clientRouter);
// app.use("/api/v1/provider", authJWT, providerRouter);
// app.use("/api/v1/chat", authJWT, chatRouter);
// app.use("/api/v1/public-chat", publicChatRouter);
// app.use("/api/v1/chat-channel", authJWT, chatChannelRouter);
// app.use("/api/v1/chat-group", authJWT, chatGroupRouter);
// app.use("/api/v1/document", authJWT, documentRouter);
// app.use("/api/v1/notification", authJWT, notificationRouter);
// app.use("/api/v1/invite", authJWT, invitationEmailRouter);
// app.use("/api/v1/super-admin", authJWT, superAdminRouter);


// export default app;





// src/app.ts

import cors from "cors";
import dotenv from "dotenv";

// Security middleware imports
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";

// Primary Imports
import cookieParser from "cookie-parser";
import express from "express";
import path from "path";

// Middlewares Imports
import { ALLOWED_HEADERS, ALLOWED_METHODS } from "./utils/constants";
import morganMiddleware from "./middlewares/morgan.middleware";
import { authJWT } from "./middlewares/auth.middleware";

// Routers Imports
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

// Declaration of Express App
const app = express();
app.set("trust proxy", 1);

dotenv.config({ path: ".env" });

// Helmet
app.use(helmet());

// Rate limiter middleware
const limitter = rateLimit({
  max: 100000,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests from this IP please try again in an hour",
  validate: true,
});

// ✅ CORS (ONLY ONE) — supports cookies/credentials
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "https://collaborative-platform-frontend.vercel.app",
  "https://www.collaborateme.com",
  "https://collaborateme.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
  })
);

// Proper preflight handling
app.options("*", cors());

// Prevent parameter pollution
app.use(hpp());

// Common middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morganMiddleware);

// Rate limit APIs
app.use("/api", limitter);

// Serve uploaded documents statically
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

// Routes 
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


// ✅ New Super Admin route
app.use("/api/v1/super-admin", superAdminRouter);


export default app;
