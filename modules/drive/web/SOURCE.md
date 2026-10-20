Ported from `otterware-app/otter-drive` `apps/web/src` at `22e2ec10211ef2f510d85d862ccb8b43fc27b05a`
(components, `lib`, `main`). Drive owns these components; `host.tsx` replaces the standalone
app's sign-in, routing and same-origin API with whatever app hosts Drive, and every request
goes to Otter Cloud through `@otterware/otter-cloud-client/drive`.

Latest reviewed source: `otterware-app/otter-drive@514675ad0a8590acff4c904047b59438fa2d16a8`.
Storage backends and public read-only links are selectively ported into the module and Cloud API.
See [the source audit](../../../docs/operations/source-sync.md) for retained host boundaries.
