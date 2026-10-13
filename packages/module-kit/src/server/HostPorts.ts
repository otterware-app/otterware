/**
 * What the host (apps/server) supplies to the module runtime. Module-kit
 * never imports the server, so these are the seams through which host-owned
 * capabilities reach modules: the assistant project (ADR 0004) and Code's own
 * Home contributor.
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { HomeContributor } from "../engine/ServerModule.ts";
import type { AssistantProject, AssistantProjectError } from "../contracts/host.ts";

export class AssistantProjectHost extends Context.Service<
  AssistantProjectHost,
  {
    /** Finds or creates the project and (re)creates its folder. */
    readonly ensure: Effect.Effect<AssistantProject, AssistantProjectError>;
  }
>()("@otterware/module-kit/server/HostPorts/AssistantProjectHost") {}

/** Contributors the host itself feeds Home with, present whatever modules are on. */
export class HostHomeContributors extends Context.Service<
  HostHomeContributors,
  ReadonlyArray<HomeContributor>
>()("@otterware/module-kit/server/HostPorts/HostHomeContributors") {}
