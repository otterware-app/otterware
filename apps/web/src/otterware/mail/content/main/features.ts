import { mailBridge } from "../host/bridge";
import type { BridgeFeatures } from "@otterware/mail-contracts";

/** What the shell running the app can do (all of it on the Mac); the UI hides the rest. */
export const features: BridgeFeatures = mailBridge.features;
