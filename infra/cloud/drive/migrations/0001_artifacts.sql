PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artifact (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  owner_user_id TEXT,
  created_by_actor_type TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'organization')),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published')),
  current_version_id TEXT,
  version_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS artifact_org_updated_idx
  ON artifact (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS artifact_owner_idx
  ON artifact (owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS artifact_version (
  id TEXT PRIMARY KEY NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  label TEXT NOT NULL,
  entry_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT,
  created_by_api_key_id TEXT,
  created_by_name TEXT,
  file_count INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  UNIQUE (artifact_id, number)
);

CREATE INDEX IF NOT EXISTS artifact_version_artifact_idx
  ON artifact_version (artifact_id, number DESC);

CREATE TABLE IF NOT EXISTS artifact_file (
  version_id TEXT NOT NULL REFERENCES artifact_version(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  PRIMARY KEY (version_id, path)
);

CREATE TABLE IF NOT EXISTS artifact_upload (
  id TEXT PRIMARY KEY NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'api_key')),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  version_id TEXT NOT NULL UNIQUE,
  version_number INTEGER NOT NULL,
  expected_current_version INTEGER,
  label TEXT NOT NULL,
  entry_path TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'complete', 'aborted')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS artifact_upload_expiry_idx
  ON artifact_upload (state, expires_at);

CREATE TABLE IF NOT EXISTS audit_event (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_event_org_created_idx
  ON audit_event (organization_id, created_at DESC);
