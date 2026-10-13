CREATE TABLE mail_login (
  state TEXT PRIMARY KEY NOT NULL,
  verifier TEXT NOT NULL,
  callback TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT INTO oauth_client
  (id, client_id, name, uri, redirect_uris, token_endpoint_auth_method, grant_types,
   response_types, scopes, skip_consent, enable_end_session, require_pkce, metadata)
VALUES
  ('otter-mail', 'otter-mail', 'Otter Mail', 'https://mail.otterware.app',
   '["https://relay.mail.otterware.app/v1/auth/callback/otter"]',
   'none', '["authorization_code"]', '["code"]', '["openid","profile","email"]',
   1, 1, 1, '{"app":"otter-mail"}');
