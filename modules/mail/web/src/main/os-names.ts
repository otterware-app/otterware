import { mailBridge } from "../host/bridge";
/**
 * What the computer is called in copy, where the app runs: "your Mac", or
 * "your computer" on Linux. Only for words; what the app can do is `features`.
 */

const linux = mailBridge.platform === "linux";
const web = mailBridge.platform === "web";

export const osNames = {
  /** "your Mac", "this Mac": the computer the app runs on. */
  computer: linux || web ? "computer" : "Mac",
  /** The OS, as in "links across macOS". */
  system: linux ? "Linux" : "macOS",
};
