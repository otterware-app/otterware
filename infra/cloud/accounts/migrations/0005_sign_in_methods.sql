-- Microsoft and email/password sign-in use the existing account table (password column).
-- Better Auth's rate limiter counts password attempts per client IP and path.
CREATE TABLE rate_limit (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  last_request INTEGER NOT NULL
);
