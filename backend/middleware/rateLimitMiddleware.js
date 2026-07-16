const rateLimit = require('express-rate-limit');

/**
 * Strict limiter for login — 10 attempts per 15 minutes per IP.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  skipSuccessfulRequests: true, // only count failed/errored requests against the limit
});

/**
 * General auth limiter for all other /api/auth routes — 60 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests. Please slow down and try again shortly.',
  },
});

module.exports = { loginLimiter, authLimiter };