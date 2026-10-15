import { createRemoteJWKSet, jwtVerify } from "jose";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "./env.ts";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const notification = z.object({
  emailAddress: z.email(),
  historyId: z
    .union([z.string(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)])
    .transform(String)
    .pipe(z.string().regex(/^\d{1,20}$/)),
});

/** Optional additional Pub/Sub subscription; the existing relay subscription never moves. */
export async function gmailPush(request: Request, env: Env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new HTTPException(401);
  try {
    const { payload } = await jwtVerify(token, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: `${env.CLOUD_ORIGIN}/push/gmail`,
      algorithms: ["RS256"],
    });
    if (
      payload.email_verified !== true ||
      payload.email !== "gmail-push-relay@otterware.iam.gserviceaccount.com"
    )
      throw new Error("Unexpected push identity");
  } catch {
    throw new HTTPException(401);
  }
  const body = z
    .object({ message: z.object({ data: z.string().max(16384) }) })
    .safeParse(await request.json());
  if (!body.success) return new Response(null, { status: 204 });
  let parsed;
  try {
    parsed = notification.safeParse(JSON.parse(atob(body.data.message.data)));
  } catch {
    return new Response(null, { status: 204 });
  }
  if (!parsed.success) return new Response(null, { status: 204 });
  const email = parsed.data.emailAddress.toLowerCase();
  const users = await env.ACCOUNT_DATA.prepare(
    "SELECT DISTINCT user_id FROM provider_connection WHERE provider='google' AND lower(email)=?",
  )
    .bind(email)
    .all<{ user_id: string }>();
  await Promise.all(
    users.results.map(({ user_id }) =>
      env.ENVIRONMENT_HUB.get(env.ENVIRONMENT_HUB.idFromName(user_id)).publish({
        type: "module.push",
        module: "mail",
        event: { type: "mail", email, historyId: parsed.data.historyId },
      }),
    ),
  );
  return new Response(null, { status: 204 });
}
