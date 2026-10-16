/**
 * The CLI signs in to the Otter Account itself (device authorization), like Code's server CLI:
 * each machine keeps its own renewable grant. Drive requests use a short-lived Otter Cloud
 * capability for `otterware:drive`, so revoking this grant at Accounts ends access at once.
 */
import { DRIVE_CLOUD_AUDIENCE } from "@otterware/drive-contracts/constants";
import type { AccountGrant } from "./config";

const ACCOUNTS_URL = (process.env.OTTER_ACCOUNTS_URL ?? "https://accounts.otterware.app/v1/auth")
  .trim()
  .replace(/\/$/, "");
/** Accounts' existing CLI client; its tokens are scoped to the Code relay resource. */
const CLIENT_ID = "otter-code-cli";
const RESOURCE = "https://relay.code.otterware.app";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

const form = async (path: string, params: Record<string, string>) => {
  const response = await fetch(`${ACCOUNTS_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(String(body.error ?? `Otter Accounts answered ${response.status}.`));
  return body;
};

const grantOf = (token: TokenResponse, previous?: AccountGrant): AccountGrant => {
  const refreshToken = token.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) throw new Error("Otter Accounts did not grant offline access.");
  return {
    accessToken: token.access_token,
    refreshToken,
    expiresAt: Date.now() + token.expires_in * 1_000,
  };
};

export async function startDeviceLogin() {
  const code = await form("/device/code", {
    client_id: CLIENT_ID,
    resource: RESOURCE,
    scope: "openid profile email offline_access",
  });
  return {
    deviceCode: String(code.device_code),
    userCode: String(code.user_code),
    verificationUrl: String(code.verification_uri_complete ?? code.verification_uri),
    expiresIn: Number(code.expires_in),
    interval: Number(code.interval ?? 5),
  };
}

/** One poll of the device grant; null while the user has not approved yet. */
export async function pollDeviceLogin(
  deviceCode: string,
): Promise<AccountGrant | "slow_down" | null> {
  try {
    return grantOf(
      (await form("/oauth2/token", {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: CLIENT_ID,
        resource: RESOURCE,
      })) as unknown as TokenResponse,
    );
  } catch (error) {
    const reason = (error as Error).message;
    if (reason === "authorization_pending") return null;
    if (reason === "slow_down") return "slow_down";
    throw error;
  }
}

/** A current grant, renewed (and rotated) a minute before its access token expires. */
export async function freshGrant(grant: AccountGrant): Promise<AccountGrant> {
  if (grant.expiresAt - 60_000 > Date.now()) return grant;
  return grantOf(
    (await form("/oauth2/token", {
      grant_type: "refresh_token",
      refresh_token: grant.refreshToken,
      client_id: CLIENT_ID,
      resource: RESOURCE,
    })) as unknown as TokenResponse,
    grant,
  );
}

/** Exchanges the grant for Drive's capability: Accounts' suite session, then Otter Cloud. */
export async function driveCapability(grant: AccountGrant, cloudOrigin: string): Promise<string> {
  const session = await fetch(`${ACCOUNTS_URL}/suite/session`, {
    method: "POST",
    headers: { authorization: `Bearer ${grant.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!session.ok) throw new Error("Your Otter Account sign-in ended. Run otterdrive auth login.");
  const { token } = (await session.json()) as { token: string };
  const capability = await fetch(`${cloudOrigin}/v1/cloud/token`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ audience: DRIVE_CLOUD_AUDIENCE }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!capability.ok) throw new Error(`Otter Cloud answered ${capability.status}.`);
  return ((await capability.json()) as { accessToken: string }).accessToken;
}

/** Revokes this machine's grant at Accounts (RFC 7009); other devices stay signed in. */
export async function revokeGrant(grant: AccountGrant): Promise<void> {
  await form("/oauth2/revoke", {
    token: grant.refreshToken,
    token_type_hint: "refresh_token",
    client_id: CLIENT_ID,
  }).catch(() => {});
}
