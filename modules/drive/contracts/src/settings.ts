import { defineModuleSettings } from "@otterware/module-kit/contracts";
import * as Schema from "effect/Schema";
/** Drive keeps folders and sharing in Otter Cloud; only display choices are settings. */
export const DriveSettings = defineModuleSettings({
  listDensity: {
    scope: "client",
    schema: Schema.Literals(["comfortable", "compact"]),
    default: "comfortable",
    label: "Document list density",
  },
});
