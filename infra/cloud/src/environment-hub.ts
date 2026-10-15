import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "./auth.ts";
import { providerToken } from "./providers.ts";
import { pullRecords, pushRecords, pushSchema } from "./sync.ts";
import type { Env, Identity } from "./env.ts";
import { SESSION_HEADER } from "../mail/src/user-hub.ts";

const messageSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().max(100), type: z.literal("provider.token"), connectionId: z.uuid() }),
  z.object({
    id: z.string().max(100),
    type: z.literal("sync.push"),
    records: pushSchema.shape.records,
  }),
  z.object({
    id: z.string().max(100),
    type: z.literal("sync.pull"),
    cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
]);
type Attachment = {
  token: string;
  audience: string;
  expiresAt: number;
  sessionId: string;
  userId: string;
};

/** New account hub. The old Mail namespace remains owned by its existing Worker. */
export class EnvironmentHub extends DurableObject<Env> {
  private upstream: WebSocket | undefined;
  private readonly refreshes = new Map<
    string,
    Promise<Awaited<ReturnType<typeof providerToken>>>
  >();
  async token(identity: Identity, id: string) {
    const existing = this.refreshes.get(id);
    if (existing) return { ...(await existing), audience: identity.audience };
    const promise = providerToken(this.env, identity, id);
    this.refreshes.set(id, promise);
    try {
      return await promise;
    } finally {
      this.refreshes.delete(id);
    }
  }
  disconnect(sessionId?: string) {
    for (const socket of this.ctx.getWebSockets(sessionId)) socket.close(4001, "Signed out");
  }

  override async fetch(request: Request) {
    const token = request.headers.get("authorization")?.slice(7) ?? "";
    const audience = request.headers.get("x-otter-audience") ?? "";
    const identity = await verifyToken(this.env, token, audience);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [identity.sessionId]);
    server.serializeAttachment({
      token,
      audience,
      expiresAt: identity.expiresAt,
      sessionId: identity.sessionId,
      userId: identity.userId,
    } satisfies Attachment);
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
    // This is a read subscription to the existing hub, so Pub/Sub keeps its current delivery URL.
    // Outbound WebSockets keep this object awake while clients need legacy Mail push.
    if (!this.upstream) {
      const response = await this.env.LEGACY_USER_HUB.get(
        this.env.LEGACY_USER_HUB.idFromName(identity.userId),
      ).fetch(
        new Request("https://mail-hub/ws", {
          headers: { upgrade: "websocket", [SESSION_HEADER]: identity.sessionId },
        }),
      );
      const upstream = response.webSocket;
      if (upstream) {
        this.upstream = upstream;
        upstream.accept();
        upstream.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return;
          let data: unknown;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          void this.publish({ type: "module.push", module: "mail", event: data });
        });
        upstream.addEventListener("close", () => {
          this.upstream = undefined;
          this.closeAll("Mail channel closed; reconnect.");
        });
        upstream.addEventListener("error", () => {
          this.upstream = undefined;
          this.closeAll("Mail channel failed; reconnect.");
        });
      } else {
        server.close(1011, "Mail channel unavailable");
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async publish(event: unknown) {
    // Events may arrive after sign-out. Never fan them out using only the initial handshake.
    await Promise.all(
      this.ctx.getWebSockets().map(async (socket) => {
        const attachment = socket.deserializeAttachment() as Attachment;
        try {
          await verifyToken(this.env, attachment.token, attachment.audience);
          socket.send(JSON.stringify(event));
        } catch {
          socket.close(4001, "Sign in again");
        }
      }),
    );
  }

  override async webSocketMessage(socket: WebSocket, input: string | ArrayBuffer) {
    let id: string | undefined;
    try {
      if (typeof input !== "string" || new TextEncoder().encode(input).length > 256_000)
        throw new HTTPException(400);
      const attachment = socket.deserializeAttachment() as Attachment;
      const identity = await verifyToken(this.env, attachment.token, attachment.audience);
      if (input === "ping") {
        socket.send("pong");
        return;
      }
      const message = messageSchema.parse(JSON.parse(input));
      id = message.id;
      let data;
      switch (message.type) {
        case "provider.token":
          data = await this.token(identity, message.connectionId);
          break;
        case "sync.pull":
          data = await pullRecords(this.env, identity.userId, message.cursor);
          break;
        case "sync.push":
          data = await pushRecords(this.env, identity.userId, message.records);
          await this.publish({ type: "sync.changed" });
          break;
      }
      socket.send(JSON.stringify({ type: "result", id, data }));
    } catch (error) {
      const status =
        error instanceof HTTPException
          ? error.status
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 500;
      socket.send(
        JSON.stringify({
          type: "error",
          id,
          status,
          error: status === 500 ? "Cloud request failed." : "Request rejected.",
        }),
      );
      if (status === 401) socket.close(4001, "Sign in again");
    }
  }

  override async alarm() {
    await this.publish({ type: "heartbeat" });
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(Date.now() + 60_000);
    else {
      this.upstream?.close(1000);
      this.upstream = undefined;
    }
  }
  private closeAll(reason: string) {
    for (const socket of this.ctx.getWebSockets()) socket.close(1012, reason);
  }
  override webSocketClose(socket: WebSocket) {
    socket.close(1000);
    if (!this.ctx.getWebSockets().length) {
      this.upstream?.close(1000);
      this.upstream = undefined;
    }
  }
  override webSocketError(socket: WebSocket) {
    socket.close(1011, "Channel failed");
  }
}
