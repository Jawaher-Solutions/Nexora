// Application-wide constants
// RULE: Only compile-time constants. No I/O, no env variables.

export const BCRYPT_ROUNDS = 12;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

export const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500MB in bytes

export const FLAG_THRESHOLD = 0.5; // flags_count > 50% of likes_count → escalate

export const MODERATION = {
  AUTO_APPROVE_THRESHOLD: 40,   // Below 40% confidence → auto approve
  ESCALATE_THRESHOLD: 70,       // 40-70% → escalate to human
  AUTO_REJECT_THRESHOLD: 70,    // Above 70% → auto reject
  MAX_RETRIES: 3,
};

export const VIDEO_DURATION = {
  SHORT_MAX_SECONDS: 60,        // Short-form max 60 seconds
  LONG_MAX_SECONDS: 3600,       // Long-form max 1 hour
};

export const REFRESH_TOKEN_EXPIRY_DAYS = 30;
