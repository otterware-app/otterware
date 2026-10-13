import { defineModuleSettings } from "@otterware/module-kit/contracts";
import * as Schema from "effect/Schema";
export const DriveSettings = defineModuleSettings({
  defaultFolder: {
    scope: "account",
    schema: Schema.NullOr(Schema.String),
    default: null,
    label: "Default upload folder",
  },
  listDensity: {
    scope: "client",
    schema: Schema.Literals(["comfortable", "compact"]),
    default: "comfortable",
    label: "Document list density",
  },
});
