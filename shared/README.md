# shared

Types and behavior shared by the Kanwas desktop renderer, local runtime, and
embedded Yjs core.

The package contains the local API contract, canvas/document types, Yjs client
protocol, BlockNote conversion, and folder-fidelity utilities. It has no
service-dependent integration harness; local runtime integration is tested by
the runtime and Yjs core packages.

```sh
pnpm --filter shared build
pnpm --filter shared test
```
