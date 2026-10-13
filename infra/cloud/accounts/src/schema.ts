/**
 * The relay's D1 schema. `pnpm db:generate` turns changes here into a SQL
 * migration in migrations/; deploying applies it.
 *
 * `user`, `session`, `account` and `verification` are better-auth's tables
 * (its core schema, https://www.better-auth.com/docs/concepts/database);
 * the others are the relay's own.
 */

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

/** Otter accounts. */
export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: integer({ mode: "boolean" }).notNull().default(false),
  image: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One per signed-in device. */
export const session = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user").on(t.userId)],
);

/** The Google identity an Otter account signs in with. */
export const account = sqliteTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: integer({ mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer({ mode: "timestamp_ms" }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user").on(t.userId)],
);

export const verification = sqliteTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const jwks = sqliteTable("jwks", {
  id: text().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: integer({ mode: "timestamp_ms" }).notNull(),
  expiresAt: integer({ mode: "timestamp_ms" }),
  alg: text(),
  crv: text(),
});

export const oauthClient = sqliteTable(
  "oauth_client",
  {
    id: text().primaryKey(),
    clientId: text().notNull().unique(),
    clientSecret: text(),
    clientDiscoveryId: text(),
    disabled: integer({ mode: "boolean" }).default(false),
    skipConsent: integer({ mode: "boolean" }),
    enableEndSession: integer({ mode: "boolean" }),
    subjectType: text(),
    scopes: text({ mode: "json" }).$type<string[]>(),
    clientCredentialsScopes: text({ mode: "json" }).$type<string[]>().default([]),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer({ mode: "timestamp_ms" }),
    updatedAt: integer({ mode: "timestamp_ms" }),
    name: text(),
    uri: text(),
    icon: text(),
    contacts: text({ mode: "json" }).$type<string[]>(),
    tos: text(),
    policy: text(),
    softwareId: text(),
    softwareVersion: text(),
    softwareStatement: text(),
    redirectUris: text({ mode: "json" }).$type<string[]>().notNull(),
    postLogoutRedirectUris: text({ mode: "json" }).$type<string[]>(),
    backchannelLogoutUri: text(),
    backchannelLogoutSessionRequired: integer({ mode: "boolean" }),
    tokenEndpointAuthMethod: text(),
    applicationType: text(),
    jwks: text(),
    jwksUri: text(),
    grantTypes: text({ mode: "json" }).$type<string[]>(),
    responseTypes: text({ mode: "json" }).$type<string[]>(),
    requirePKCE: integer({ mode: "boolean" }),
    dpopBoundAccessTokens: integer({ mode: "boolean" }).default(false),
    referenceId: text(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
  },
  (t) => [index("oauth_client_user_id").on(t.userId)],
);

export const oauthResource = sqliteTable("oauth_resource", {
  id: text().primaryKey(),
  identifier: text().notNull().unique(),
  name: text().notNull(),
  accessTokenTtl: integer(),
  refreshTokenTtl: integer(),
  signingAlgorithm: text(),
  signingKeyId: text(),
  allowedScopes: text({ mode: "json" }).$type<string[]>(),
  customClaims: text({ mode: "json" }).$type<Record<string, unknown>>(),
  dpopBoundAccessTokensRequired: integer({ mode: "boolean" }).default(false),
  disabled: integer({ mode: "boolean" }).default(false),
  createdAt: integer({ mode: "timestamp_ms" }),
  updatedAt: integer({ mode: "timestamp_ms" }),
  policyVersion: integer().default(1),
  metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
});

export const oauthClientResource = sqliteTable(
  "oauth_client_resource",
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text()
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer({ mode: "timestamp_ms" }),
  },
  (t) => [
    index("oauth_client_resource_client_id").on(t.clientId),
    index("oauth_client_resource_resource_id").on(t.resourceId),
  ],
);

export const oauthRefreshToken = sqliteTable(
  "oauth_refresh_token",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text().references(() => session.id, { onDelete: "set null" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text({ mode: "json" }).$type<string[]>(),
    requestedUserInfoClaims: text({ mode: "json" }).$type<string[]>(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    revoked: integer({ mode: "timestamp_ms" }),
    rotatedAt: integer({ mode: "timestamp_ms" }),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: integer({ mode: "timestamp_ms" }),
    authTime: integer({ mode: "timestamp_ms" }),
    confirmation: text({ mode: "json" }).$type<Record<string, unknown>>(),
    scopes: text({ mode: "json" }).$type<string[]>().notNull(),
  },
  (t) => [
    index("oauth_refresh_token_client_id").on(t.clientId),
    index("oauth_refresh_token_session_id").on(t.sessionId),
    index("oauth_refresh_token_user_id").on(t.userId),
    index("oauth_refresh_token_authorization_code_id").on(t.authorizationCodeId),
  ],
);

export const oauthAccessToken = sqliteTable(
  "oauth_access_token",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text().references(() => session.id, { onDelete: "set null" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text({ mode: "json" }).$type<string[]>(),
    requestedUserInfoClaims: text({ mode: "json" }).$type<string[]>(),
    refreshId: text().references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    revoked: integer({ mode: "timestamp_ms" }),
    confirmation: text({ mode: "json" }).$type<Record<string, unknown>>(),
    scopes: text({ mode: "json" }).$type<string[]>().notNull(),
  },
  (t) => [
    index("oauth_access_token_client_id").on(t.clientId),
    index("oauth_access_token_session_id").on(t.sessionId),
    index("oauth_access_token_user_id").on(t.userId),
    index("oauth_access_token_authorization_code_id").on(t.authorizationCodeId),
    index("oauth_access_token_refresh_id").on(t.refreshId),
  ],
);

export const oauthConsent = sqliteTable(
  "oauth_consent",
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    resources: text({ mode: "json" }).$type<string[]>(),
    requestedUserInfoClaims: text({ mode: "json" }).$type<string[]>(),
    scopes: text({ mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("oauth_consent_client_id").on(t.clientId),
    index("oauth_consent_user_id").on(t.userId),
  ],
);

export const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
  id: text().primaryKey(),
  expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
});

/** Remembers app membership even after OAuth tokens expire or a device signs out. */
export const identityApps = sqliteTable(
  "identity_apps",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    appId: text().notNull(),
    linkedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.appId] })],
);

/** Pending, single-use OAuth approvals for headless Code servers. */
export const deviceCode = sqliteTable("device_code", {
  id: text().primaryKey(),
  deviceCode: text().notNull().unique(),
  userCode: text().notNull().unique(),
  userId: text().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
  status: text().notNull(),
  lastPolledAt: integer({ mode: "timestamp_ms" }),
  pollingInterval: integer(),
  clientId: text(),
  scope: text(),
  resources: text({ mode: "json" }).$type<string[]>(),
  oauthClientId: text(),
});

/** Native app credentials derived from one Code authorization, never the browser's token. */
export const suiteSession = sqliteTable("suite_session", {
  sessionId: text()
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  authorizationCodeId: text().notNull().unique(),
});

/** Better Auth's rate limiter counts password sign-in attempts here. */
export const rateLimit = sqliteTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: integer().notNull(),
});
