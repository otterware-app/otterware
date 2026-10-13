let root: HTMLElement | undefined;
let shadow: ShadowRoot | undefined;

/** Mail owns a native shadow subtree so its retained theme and CSS cannot recolor the host. */
export function installMailDom(element: HTMLElement, container: ShadowRoot): () => void {
  root = element;
  shadow = container;
  return () => {
    if (root === element) {
      root = undefined;
      shadow = undefined;
    }
  };
}
export const mailRoot = () => {
  if (!root) throw new Error("Mail's page is not mounted.");
  return root;
};
/** Legacy document access stays inside Mail; creation and selection remain browser-owned. */
export const mailDocument = new Proxy({} as Document, {
  get(_target, key) {
    if (key === "documentElement" || key === "body" || key === "head") return mailRoot();
    if (key === "activeElement") return shadow?.activeElement ?? document.activeElement;
    if (key === "querySelector" || key === "querySelectorAll") return shadow?.[key].bind(shadow);
    if (key === "getElementById") return (id: string) => shadow?.getElementById(id) ?? null;
    const value = Reflect.get(document, key, document);
    return typeof value === "function" ? value.bind(document) : value;
  },
});
