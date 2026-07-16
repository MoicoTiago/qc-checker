const AuditLog = require('../models/AuditLog');

/**
 * Extract the real client IP from a request.
 * With `app.set('trust proxy', 1)` in server.js, Express populates req.ip
 * correctly from x-forwarded-for when behind a proxy/load balancer.
 * Falls back through other sources for direct connections.
 */
const getIp = (req) => {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    null
  );
};

/**
 * Write an audit log entry. Never throws — failures are logged to console only
 * so they never break the calling request.
 *
 * @param {string} action  - One of the AuditLog action enum values
 * @param {object} params
 * @param {object} [params.req]      - Express request (for IP + User-Agent)
 * @param {string} [params.userId]   - ObjectId of the authenticated user
 * @param {string} [params.email]    - Email address involved in the action
 * @param {object} [params.details]  - Any extra context to store
 */
const log = async (action, { req, userId, email, details } = {}) => {
  try {
    await AuditLog.create({
      action,
      userId: userId || null,
      email: email ? email.toLowerCase() : null,
      ip: req ? getIp(req) : null,
      userAgent: req?.headers?.['user-agent'] || null,
      details: details || {},
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write log entry:', err.message);
  }
};

module.exports = { log, getIp };