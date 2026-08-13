# Desktop releases

Kanwas uses electron-builder on native GitHub-hosted runners. The package
version in `desktop/package.json` is the desktop release version and must match
the pushed Git tag exactly (`v0.1.0`, for example).

## Release artifacts

The release workflow builds and smoke-tests the unpacked app before retaining
these files:

| Platform | Architectures | GitHub Release assets |
| -------- | ------------- | --------------------- |
| macOS    | arm64, x64    | DMG and ZIP           |
| Windows  | x64           | NSIS installer        |
| Linux    | x64           | AppImage and DEB      |

Artifact names include the product version, operating system, and architecture.
The final job also publishes `SHA256SUMS.txt` and GitHub build-provenance
attestations. It creates no release if any native build or packaged-app smoke
test fails.

## Create a release

1. Update `desktop/package.json` to the intended semantic version and merge the
   release commit into `master`.
2. Tag that commit and push the tag:

   ```bash
   git tag -a v0.1.0 -m "Kanwas 0.1.0"
   git push origin v0.1.0
   ```

3. Follow **Release desktop application** in GitHub Actions. After every build
   succeeds, the workflow creates the GitHub Release with generated notes.

Prerelease versions such as `0.2.0-beta.1` use matching tags such as
`v0.2.0-beta.1` and are marked as GitHub prereleases. The workflow rejects a
tag whose version differs from `desktop/package.json` or whose commit is not
contained in `master`. A failed run can be rerun from GitHub Actions without
moving or recreating the tag.

## Local packaging

From the repository root:

```bash
pnpm package:desktop:dir # unpacked app for packaging/debug checks
pnpm package:desktop     # configured installers for the host OS
```

Platform-specific scripts are also available as `package:mac`, `package:win`,
and `package:linux` in the desktop workspace. Build on the target operating
system: `node-pty` is native and must match both the OS/architecture and
Electron ABI. Outputs are written below `desktop/release/`.

## Signing and notarization

The workflow deliberately builds unsigned artifacts when secrets are absent.
Unsigned macOS and Windows downloads produce normal Gatekeeper/SmartScreen
warnings. Add these GitHub Actions repository secrets when certificates are
available; the build automatically signs and then verifies the output.

### macOS

- `MAC_CSC_LINK`: base64-encoded Developer ID Application `.p12`
- `MAC_CSC_KEY_PASSWORD`: password for that certificate
- `APPLE_API_KEY_BASE64`: base64-encoded App Store Connect `.p8` key
- `APPLE_API_KEY_ID`: App Store Connect key ID
- `APPLE_API_ISSUER`: App Store Connect issuer ID
- `APPLE_TEAM_ID`: Apple Developer team ID

The electron-builder configuration already enables hardened runtime, Electron
entitlements, notarization, and stapling. The workflow validates both the code
signature and notarization ticket whenever the corresponding secrets are set.

### Windows

- `WIN_CSC_LINK`: base64-encoded code-signing `.pfx`
- `WIN_CSC_KEY_PASSWORD`: password for that certificate

The workflow verifies Authenticode on both the packaged executable and NSIS
installer whenever the Windows certificate is configured.

Linux artifacts do not use application code signing in this flow. GitHub
provenance attestations and the checksum manifest cover all published assets.

## Current boundary

GitHub Releases are the download and distribution channel. In-app automatic
updates are intentionally not part of this change; adding `electron-updater`
requires a separate product and security decision.
