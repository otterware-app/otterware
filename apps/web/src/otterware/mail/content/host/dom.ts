/** Content and portals participate in the host document, never a second root. */
export const mailRoot = () => document.body;
export const mailDocument = new Proxy({} as Document, {
  get(_target, key) {
    const value = Reflect.get(document, key, document);
    return typeof value === "function" ? value.bind(document) : value;
  },
});
