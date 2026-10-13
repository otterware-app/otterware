import { buildDriveAssets } from "./drive-assets.ts";
import { bundle } from "./bundle.ts";
await bundle();

await buildDriveAssets();
