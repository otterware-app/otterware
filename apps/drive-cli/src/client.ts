import { apiErrorSchema } from "@otterware/drive-contracts/api";
import { DRIVE_CLOUD_AUDIENCE } from "@otterware/drive-contracts/constants";
import { driveCapability, freshGrant } from "./account";
import { profileNameOf, updateProfile, type Profile } from "./config";

/** One capability per process and profile; Cloud's capabilities last 15 minutes. */
const capabilities = new WeakMap<Profile, { token: string; at: number }>();

export class ApiClient {
  readonly baseUrl: string;

  private readonly profile: Profile;
  constructor(profile: Profile) {
    this.profile = profile;
    this.baseUrl = profile.apiUrl.replace(/\/$/, "");
  }

  async request<T>(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    // Credentials go only to the configured API, never to a server-supplied upload host.
    if (new URL(url).origin !== new URL(this.baseUrl).origin)
      throw new Error(`Refusing to send Drive credentials to ${new URL(url).origin}.`);
    const headers = new Headers(init.headers);
    headers.set("accept", init.raw ? "*/*" : "application/json");
    if (this.profile.apiKey) headers.set("x-api-key", this.profile.apiKey);
    if (this.profile.accessToken) {
      headers.set("authorization", `Bearer ${this.profile.accessToken}`);
    } else if (this.profile.accountGrant && !this.profile.apiKey) {
      headers.set("authorization", `Bearer ${await this.capability()}`);
      headers.set("x-otter-audience", DRIVE_CLOUD_AUDIENCE);
    }
    if (this.profile.folderId) {
      headers.set("x-otterdrive-folder", this.profile.folderId);
    }
    if (init.body && typeof init.body === "string" && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const parsed = apiErrorSchema.safeParse(body);
      const generic =
        typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
      const message = parsed.success
        ? parsed.data.error.code === "identity_conflict"
          ? "Your Drive account was created before Otter Accounts and needs a one-time migration. Contact Otterware support, or use an API key meanwhile."
          : parsed.data.error.message
        : typeof generic?.error === "string"
          ? `${generic.error}: ${String(generic.error_description ?? generic.message ?? "")}`
          : `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    if (init.raw) return response as T;
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async capability(): Promise<string> {
    const cached = capabilities.get(this.profile);
    if (cached && Date.now() - cached.at < 14 * 60_000) return cached.token;
    const previous = this.profile.accountGrant!;
    const grant = await freshGrant(previous);
    if (grant !== previous) {
      this.profile.accountGrant = grant;
      const name = profileNameOf(this.profile);
      if (name) await updateProfile(name, { accountGrant: grant }, false);
    }
    const token = await driveCapability(grant, this.baseUrl);
    capabilities.set(this.profile, { token, at: Date.now() });
    return token;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method: "POST" };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.request<T>(path, init);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}
