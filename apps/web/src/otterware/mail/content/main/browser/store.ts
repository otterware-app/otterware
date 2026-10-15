import { mailBridge } from "../../host/bridge";
/** Links use the host browser policy and its shared browser profile. */
export function openLink(url: string, _options: { flip?: boolean | undefined } = {}): void {
  void mailBridge.openExternal(url);
}
