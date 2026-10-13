-- Extend the existing public web client; keep all old clients and callbacks intact.
UPDATE oauth_client
SET redirect_uris = json_insert(redirect_uris, '$[#]', 'https://drive.otterware.app/account/callback')
WHERE client_id = 'otter-code-web'
AND NOT EXISTS (SELECT 1 FROM json_each(redirect_uris) WHERE value = 'https://drive.otterware.app/account/callback');

UPDATE oauth_client
SET redirect_uris = json_insert(redirect_uris, '$[#]', 'https://cloud.otterware.app/account/callback')
WHERE client_id = 'otter-code-web'
AND NOT EXISTS (SELECT 1 FROM json_each(redirect_uris) WHERE value = 'https://cloud.otterware.app/account/callback');
