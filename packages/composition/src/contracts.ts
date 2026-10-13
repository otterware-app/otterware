/**
 * The wire surface of this build: the host RPCs plus the contracts of the
 * modules the active profile includes. `packages/contracts` merges
 * `OtterwareRpcGroup` into `WsRpcGroup`, so every client gets typed RPCs.
 *
 * The group's type is the superset of every module this repository knows,
 * so one client build serves every profile; its value holds only the active
 * modules, so a server never answers a method of a module it does not ship.
 */
import { DriveContract } from "@otterware/drive-contracts";
import { CalendarContract } from "@otterware/calendar-contracts";
import { MailContract } from "@otterware/mail-contracts/rpc";
import { HomeContract } from "@otterware/home-contracts";
import {
  type AnyModuleContract,
  HostContract,
  mergeModuleContracts,
} from "@otterware/module-kit/contracts";
import type { AppProfile, ModuleId } from "@otterware/profiles";
import { activeProfile } from "@otterware/profiles/active";
import { type AuthEnvironmentScope, RpcScopeAuthorization, WsRpcGroup } from "@t3tools/contracts";

/** Every module contract this repository knows. A new module adds one line. */
export const MODULE_CONTRACTS = {
  home: HomeContract,
  drive: DriveContract,
  mail: MailContract,
  calendar: CalendarContract,
} as const satisfies Partial<Record<ModuleId, AnyModuleContract>>;

export type KnownModuleId = keyof typeof MODULE_CONTRACTS;

export const isKnownModuleId = (id: string): id is KnownModuleId => id in MODULE_CONTRACTS;

/** The profile's modules that have an implementation here, in profile order. */
export const selectModuleIds = (profile: AppProfile): ReadonlyArray<KnownModuleId> =>
  profile.modules.filter(isKnownModuleId);

const superset = mergeModuleContracts(
  HostContract,
  HomeContract,
  MailContract,
  CalendarContract,
  DriveContract,
);
type Superset = typeof superset;

/** Host RPCs plus the active modules' contracts, typed as the superset. */
export const composeContracts = (profile: AppProfile) => {
  const contracts = selectModuleIds(profile).map((id): AnyModuleContract => MODULE_CONTRACTS[id]);
  return {
    moduleIds: selectModuleIds(profile),
    group: HostContract.group.merge(
      ...contracts.map((contract) => contract.group),
    ) as Superset["group"],
    scopes: Object.assign(
      {},
      HostContract.scopes,
      ...contracts.map((contract) => contract.scopes),
    ) as Superset["scopes"],
  };
};

const active = composeContracts(activeProfile);

export const ACTIVE_MODULE_IDS = active.moduleIds;
export const OtterwareRpcGroup = active.group;
export const OTTERWARE_RPC_REQUIRED_SCOPES: Superset["scopes"] = active.scopes;
export type OtterwareRpcTag = keyof Superset["scopes"];
export const OTTERWARE_RPC_TAGS = Object.keys(active.scopes) as ReadonlyArray<OtterwareRpcTag>;

/** `rpc.aggregate` labels for the host's instrumentation: `host`, or `module.<id>`. */
export const OTTERWARE_RPC_AGGREGATES = Object.fromEntries(
  (Object.keys(superset.scopes) as ReadonlyArray<OtterwareRpcTag>).map((tag) => {
    const moduleId = tag.slice(0, tag.indexOf("."));
    return [tag, isKnownModuleId(moduleId) ? `module.${moduleId}` : "host"];
  }),
) as Readonly<Record<OtterwareRpcTag, string>>;

/** Scopes for every superset method; what the host's `RPC_REQUIRED_SCOPES` needs. */
export const OTTERWARE_RPC_SUPERSET_SCOPES: Readonly<
  Record<OtterwareRpcTag, AuthEnvironmentScope>
> = superset.scopes;

/**
 * The upstream WebSocket group plus this build's host and module RPCs, with
 * the host's scope authorization applied to the new methods. The server and
 * `client-runtime` build their RPC server and client from this group; it is
 * merged here rather than in `packages/contracts` so that package never
 * depends on the modules (which would make the module contracts' imports of
 * it a cycle).
 */
export const OtterwareWsRpcGroup = WsRpcGroup.merge(
  OtterwareRpcGroup.middleware(RpcScopeAuthorization),
);

export * from "@otterware/home-contracts";
export { HomeItemAction, HomeItemTarget, HomeItemModule } from "@otterware/module-kit/contracts";
