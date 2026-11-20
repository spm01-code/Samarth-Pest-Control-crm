/**
 * In-memory rate limiting and account lockout helper.
 */

const ipAttempts = new Map();
const MAX_IP_ATTEMPTS = 20; // 20 requests per window
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const adminIpAttempts = new Map();
const MAX_ADMIN_IP_ATTEMPTS = 10; // 10 attempts per window for admin login
const ADMIN_IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Clean up stale IP records every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipAttempts.entries()) {
    if (now > data.resetAt) {
      ipAttempts.delete(ip);
    }
  }
  for (const [ip, data] of adminIpAttempts.entries()) {
    if (now > data.resetAt) {
      adminIpAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

export const checkIpRateLimit = (ip, isAdmin = false) => {
  const store = isAdmin ? adminIpAttempts : ipAttempts;
  const maxLimit = isAdmin ? MAX_ADMIN_IP_ATTEMPTS : MAX_IP_ATTEMPTS;
  const windowMs = isAdmin ? ADMIN_IP_WINDOW_MS : IP_WINDOW_MS;
  const now = Date.now();

  const record = store.get(ip);
  if (!record || now > record.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return { isAllowed: true, remaining: maxLimit - 1 };
  }

  record.count += 1;
  if (record.count > maxLimit) {
    const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
    return {
      isAllowed: false,
      remaining: 0,
      retryAfterSeconds,
      message: `Too many attempts. Please try again after ${retryAfterSeconds} seconds.`,
    };
  }

  return { isAllowed: true, remaining: maxLimit - record.count };
};

export const resetIpRateLimit = (ip, isAdmin = false) => {
  const store = isAdmin ? adminIpAttempts : ipAttempts;
  store.delete(ip);
};
