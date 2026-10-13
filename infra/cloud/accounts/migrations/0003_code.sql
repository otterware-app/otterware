-- Fixed public clients. Native callbacks are exact; loopback ports may vary for native clients.
INSERT INTO oauth_client
  (id, client_id, name, uri, redirect_uris, post_logout_redirect_uris,
   token_endpoint_auth_method, application_type, grant_types, response_types, scopes,
   skip_consent, enable_end_session, require_pkce, metadata)
VALUES
  ('otter-code-web', 'otter-code-web', 'Otter Code', 'https://code.otterware.app',
   '["https://code.otterware.app/account/callback"]', '["https://code.otterware.app"]',
   'none', 'web', '["authorization_code","refresh_token"]', '["code"]',
   '["openid","profile","email","offline_access"]', 1, 1, 1, '{"app":"otter-code"}'),
  ('otter-code-desktop', 'otter-code-desktop', 'Otter Code Desktop', 'https://code.otterware.app',
   '["http://127.0.0.1:34339/callback"]', '[]',
   'none', 'native', '["authorization_code","refresh_token"]', '["code"]',
   '["openid","profile","email","offline_access"]', 1, 1, 1, '{"app":"otter-code"}'),
  ('otter-code-mobile', 'otter-code-mobile', 'Otter Code Mobile', 'https://code.otterware.app',
   '["ottercode://account/callback","ottercode-dev://account/callback","ottercode-preview://account/callback"]', '[]',
   'none', 'native', '["authorization_code","refresh_token"]', '["code"]',
   '["openid","profile","email","offline_access"]', 1, 1, 1, '{"app":"otter-code"}'),
  ('otter-code-cli', 'otter-code-cli', 'Otter Code CLI', 'https://code.otterware.app',
   '["http://127.0.0.1:34338/callback"]', '[]',
   'none', 'native', '["authorization_code","refresh_token","urn:ietf:params:oauth:grant-type:device_code"]', '["code"]',
   '["openid","profile","email","offline_access"]', 1, 1, 1, '{"app":"otter-code"}');

CREATE TABLE device_code (
  id TEXT PRIMARY KEY NOT NULL,
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_polled_at INTEGER,
  polling_interval INTEGER,
  client_id TEXT,
  scope TEXT,
  resources TEXT,
  oauth_client_id TEXT
);

INSERT INTO oauth_resource (id, identifier, name, access_token_ttl, allowed_scopes)
VALUES ('otter-code-relay', 'https://relay.code.otterware.app', 'Otter Code relay', 900,
  '["openid","profile","email","offline_access"]');
INSERT INTO oauth_client_resource (id, client_id, resource_id)
SELECT client_id || '-relay', client_id, 'https://relay.code.otterware.app'
FROM oauth_client WHERE client_id IN ('otter-code-web','otter-code-desktop','otter-code-mobile','otter-code-cli');
