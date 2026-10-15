CREATE TABLE suite_session (session_id TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE, authorization_code_id TEXT NOT NULL UNIQUE);
