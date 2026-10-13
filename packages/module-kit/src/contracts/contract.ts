import { type AuthEnvironmentScope, EnvironmentAuthorizationError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type * as Rpc from "effect/rpc/Rpc";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import type * as RpcSchema from "effect/rpc/RpcSchema";

import { ModuleOffError } from "./moduleState.ts";

/** Every module RPC is named `<module>.<name>`. */
export type ModuleRpcTag<Id extends string = string> = `${Id}.${string}`;

/**
 * One module's wire surface: its RPC group and the auth scope each method
 * needs. A method without a scope is a type error, the same guarantee the
 * host's `RPC_REQUIRED_SCOPES` gives upstream methods. The host decodes and
 * authorizes these like any other RPC; handlers answer `ModuleOffError` while
 * the module is off (`./moduleState.ts`).
 */
export interface ModuleContract<Id extends string, R extends Rpc.Any> {
  readonly id: Id;
  readonly group: RpcGroup.RpcGroup<R>;
  readonly scopes: { readonly [Tag in R["_tag"]]: AuthEnvironmentScope };
}

/** A contract with its RPC types erased, for registries that hold every module. */
export interface AnyModuleContract {
  readonly id: string;
  readonly group: RpcGroup.RpcGroup<any>;
  readonly scopes: { readonly [tag: string]: AuthEnvironmentScope };
}

/** A streaming RPC keeps its errors inside the stream schema. */
type RpcErrorType<R extends Rpc.Any> = R extends Rpc.AnyWithProps
  ? R["successSchema"] extends RpcSchema.Stream<infer _A, infer E>
    ? E extends Schema.Top
      ? E["Type"]
      : never
    : R["errorSchema"]["Type"]
  : never;

/** Names the RPCs whose error channel cannot carry `ModuleOffError`. */
type RpcsMissingModuleOffError<R extends Rpc.Any> = R extends unknown
  ? ModuleOffError extends RpcErrorType<R>
    ? never
    : R["_tag"]
  : never;

/**
 * The error union every module RPC starts from: the host answers
 * `ModuleOffError` while the module is off and the authorization middleware
 * answers `EnvironmentAuthorizationError`; add the module's own errors.
 */
export const moduleRpcErrors = <const Members extends ReadonlyArray<Schema.Top>>(
  ...members: Members
) => Schema.Union([ModuleOffError, EnvironmentAuthorizationError, ...members]);

export const defineModuleContract = <
  const Id extends string,
  R extends Rpc.Any & { readonly _tag: ModuleRpcTag<Id> },
>(
  contract: [RpcsMissingModuleOffError<R>] extends [never]
    ? ModuleContract<Id, R>
    : {
        readonly error: "Every module RPC lists ModuleOffError in its error schema (use moduleRpcErrors)";
        readonly missing: RpcsMissingModuleOffError<R>;
      },
): ModuleContract<Id, R> => contract as ModuleContract<Id, R>;

/** The RPC tags of a contract, as the group lists them. */
export const moduleContractTags = (contract: AnyModuleContract): ReadonlyArray<string> => [
  ...contract.group.requests.keys(),
];

/** Merges contracts into one group and one scope table, for the host's `WsRpcGroup`. */
export const mergeModuleContracts = <const Rs extends readonly [Rpc.Any, ...Array<Rpc.Any>]>(
  ...contracts: {
    readonly [K in keyof Rs]: {
      readonly group: RpcGroup.RpcGroup<Rs[K]>;
      readonly scopes: { readonly [Tag in Rs[K]["_tag"]]: AuthEnvironmentScope };
    };
  }
): {
  readonly group: RpcGroup.RpcGroup<Rs[number]>;
  readonly scopes: { readonly [Tag in Rs[number]["_tag"]]: AuthEnvironmentScope };
} => {
  const [first, ...rest] = contracts as unknown as ReadonlyArray<{
    readonly group: RpcGroup.RpcGroup<Rs[number]>;
    readonly scopes: Record<string, AuthEnvironmentScope>;
  }>;
  return {
    group: first!.group.merge(...rest.map((contract) => contract.group)),
    scopes: Object.assign({}, ...contracts.map((contract) => contract.scopes)),
  };
};
