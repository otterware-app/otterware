import * as Schema from "effect/Schema";

/**
 * Where a setting is stored (ADR 0011): `account` syncs through the Otter
 * Account and is the default for module preferences, `environment` lives on
 * that server, `client` on the device. Settings UI shows the scope next to
 * each row.
 */
export const ModuleSettingScope = Schema.Literals(["account", "environment", "client"]);
export type ModuleSettingScope = typeof ModuleSettingScope.Type;

export interface ModuleSettingDefinition<A, I> {
  readonly scope: ModuleSettingScope;
  readonly schema: Schema.Codec<A, I>;
  readonly default: A;
  readonly label: string;
  readonly description?: string;
}

export type ModuleSettingsDefinition = {
  readonly [key: string]: ModuleSettingDefinition<any, any>;
};

/** The decoded value of every setting in a definition. */
export type ModuleSettingsValues<S extends ModuleSettingsDefinition> = {
  readonly [K in keyof S]: S[K] extends ModuleSettingDefinition<infer A, any> ? A : never;
};

export const defineModuleSettings = <const S extends ModuleSettingsDefinition>(settings: S): S =>
  settings;

export const moduleSettingsDefaults = <S extends ModuleSettingsDefinition>(
  settings: S,
): ModuleSettingsValues<S> =>
  Object.fromEntries(
    Object.entries(settings).map(([key, setting]) => [key, setting.default]),
  ) as ModuleSettingsValues<S>;

/** Keys of a definition stored under one scope. */
export const moduleSettingsKeysForScope = <S extends ModuleSettingsDefinition>(
  settings: S,
  scope: ModuleSettingScope,
): ReadonlyArray<keyof S & string> =>
  Object.entries(settings)
    .filter(([, setting]) => setting.scope === scope)
    .map(([key]) => key);
