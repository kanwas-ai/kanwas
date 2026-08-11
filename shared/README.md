# shared

Types and behavior shared by the Kanwas desktop renderer, local runtime, and
embedded Yjs core.

The package contains the local API contract, canvas/document types, the
workspace-only Yjs document protocol, BlockNote conversion, and folder-fidelity
utilities. The protocol synchronizes documents only; it has no presence or
dedicated-note channel. Local runtime integration is tested by the runtime and
Yjs core packages.

```sh
pnpm --filter shared build
pnpm --filter shared test
```
