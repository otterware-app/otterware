Ported from `otterware-app/otter-drive` `apps/web/src` at `22e2ec10211ef2f510d85d862ccb8b43fc27b05a`
(components, `lib`, `main`). Drive owns these components; `host.tsx` replaces the standalone
app's sign-in, routing and same-origin API with whatever app hosts Drive, and every request
goes to Otter Cloud through `@otterware/otter-cloud-client/drive`.
