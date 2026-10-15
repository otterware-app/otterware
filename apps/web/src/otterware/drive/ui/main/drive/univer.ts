import { LogLevel, Univer, type IUniverConfig, type Plugin, type PluginCtor } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";

/** A preset's plugins, as `@univerjs/preset-*-core` export them. */
interface Preset {
  readonly plugins: ReadonlyArray<
    PluginCtor<Plugin> | [PluginCtor<Plugin>, ConstructorParameters<PluginCtor<Plugin>>[0]]
  >;
}

/**
 * `@univerjs/presets`' `createUniver`, without that package: it depends on
 * every preset, including the commercial `@univerjs-pro` ones, and Drive only
 * ships the open sheets and docs presets.
 */
export function createUniver({
  presets,
  ...config
}: Partial<IUniverConfig> & { readonly presets: ReadonlyArray<Preset> }) {
  const univer = new Univer({ logLevel: LogLevel.WARN, ...config });
  for (const preset of presets)
    for (const entry of preset.plugins) {
      const [plugin, options] = Array.isArray(entry) ? entry : [entry, undefined];
      univer.registerPlugin(plugin, options);
    }
  return { univer, univerAPI: FUniver.newAPI(univer) };
}
