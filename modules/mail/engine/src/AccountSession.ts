import type { OtterCloudClient, ChannelEvent } from "@otterware/otter-cloud-client";

/** Temporary Mail-local port until the module kit exposes the host's OtterAccountSession. */
export interface OtterAccountSession {
  readonly accountId: string;
  connections: OtterCloudClient["connections"];
  providerToken: OtterCloudClient["providerToken"];
  push: OtterCloudClient["push"];
  pull: OtterCloudClient["pull"];
  /** Subscribe to the host's environment channel; the host owns reconnect and session changes. */
  subscribe: (listener: (event: ChannelEvent) => void) => () => void;
}
