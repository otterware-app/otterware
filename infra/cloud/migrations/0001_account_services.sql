-- New database only. Existing Accounts, Drive and Mail schemas are not migrated here.
CREATE TABLE provider_connection (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL, email TEXT NOT NULL, scopes TEXT NOT NULL,
  refresh_token TEXT NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(user_id, provider, provider_subject)
);
CREATE TABLE provider_oauth_state (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
  provider TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL,
  scopes TEXT NOT NULL, return_to TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE channel_ticket (
  id TEXT PRIMARY KEY, credential TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE sync_record (
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL,
  value TEXT, modified_at INTEGER NOT NULL, mutation_id TEXT NOT NULL,
  UNIQUE(user_id, collection, id)
);
CREATE INDEX sync_user_revision ON sync_record(user_id, revision);
