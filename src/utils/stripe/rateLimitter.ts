import rateLimit from "express-rate-limit";

// General rate limit: 100,000 requests per hour for all API routes
export const limitter = rateLimit({
  max: 100000,
  windowMs: 60 * 60 * 1000,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests from this IP please try again in an hour",
    });
  },
  validate: true,
  skip: (req) => req.originalUrl.includes("/webhook"),
});

// Strict rate limit: 10 requests per hour for auth routes (signup/login)
export const authLimitter = rateLimit({
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
