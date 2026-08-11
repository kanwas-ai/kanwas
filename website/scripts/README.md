# Scripts Catalog

## `figma-get-images.mjs`

Exports images through the local image-exporter bridge HTTP API (`POST /v1/images`).

Prerequisites:

- `image-exporter` bridge daemon running (default `http://localhost:3851`)
- Figma plugin connected to the daemon

### CLI contract

```bash
node scripts/figma-get-images.mjs \
  --nodes 1:2,1:3 \
  [--scale 2] \
  [--format png] \
  [--width 1600] \
  [--height 900] \
  [--load-all-pages true|false] \
  [--svg-outline-text true|false] \
  [--svg-include-id true|false] \
  [--svg-simplify-stroke true|false] \
  [--contents-only true|false] \
  [--use-absolute-bounds true|false] \
  [--suffix export-suffix] \
  [--color-profile DOCUMENT|SRGB|DISPLAY_P3_V4]
```

Options:

- `--nodes`: comma-separated node IDs to export (required)
- `--ids`: alias for `--nodes`
- `--scale`: number between `0.01` and `4`; multiplies export resolution (larger value = larger/sharper output)
- `--width`: number greater than `0`; explicit export width
- `--height`: number greater than `0`; explicit export height
- `--format`: `jpg`, `png`, `svg`, `pdf`, or `svg_string`
- Use only one of `--scale`, `--width`, or `--height`
- `--load-all-pages`: boolean; include all pages during export lookup (default `true`)
- `--svg-outline-text`: boolean (SVG only); `true` outlines text for visual fidelity, `false` keeps selectable/searchable `<text>` nodes
- `--svg-include-id`: boolean (SVG only); includes layer-based `id` attributes in SVG elements
- `--svg-simplify-stroke`: boolean (SVG only); simplifies stroke output where possible for cleaner SVG markup
- `--contents-only`: boolean (Figma default `true`)
  - `true`: export only the selected node's own content and ignore overlapping outside layers/effects (for example neighboring shadows/glows)
  - `false`: include overlapping sibling layers/effects that intersect the node's area (useful for screenshot-like context)
- `--use-absolute-bounds`: boolean (Figma default `false`)
  - `true`: preserve full node/frame bounds, including empty or cropped area (useful for text and exact layout placement)
  - `false`: tight-crop to rendered pixels (useful for icon/asset extraction without transparent padding)
  - note: this controls the crop box, not whether overlapping sibling layers are included
- `--suffix`: optional suffix string passed to bridge export params
- `--color-profile`: `DOCUMENT`, `SRGB`, or `DISPLAY_P3_V4`
- `--timeout-ms`: request timeout in milliseconds (default `120000`)
- `--[no-]pretty`: pretty-print JSON output (default true)
- `--help`: print usage

Boolean values accept `true/false`, `1/0`, `yes/no`, `on/off`, and `--no-<flag>`.

Quick mental model:

- `--contents-only` answers: "Include overlap from other layers/effects (including shadows), or not?"
- `--use-absolute-bounds` answers: "Tight-crop pixels, or keep the full node/frame bounds?"
- They are independent switches.

### Practical `contents-only` / `use-absolute-bounds` recipes

| `--contents-only` | `--use-absolute-bounds` | Includes overlapping outside layers/effects (for example shadows)? | Keeps empty/cropped node space? | Typical use                             |
| ----------------- | ----------------------- | ------------------------------------------------------------------ | ------------------------------- | --------------------------------------- |
| `true`            | `false`                 | No                                                                 | No                              | Clean icon/asset cutout                 |
| `false`           | `false`                 | Yes                                                                | No                              | Screenshot-like context with tight crop |
| `true`            | `true`                  | No                                                                 | Yes                             | Precise text/frame placement            |
| `false`           | `true`                  | Yes                                                                | Yes                             | Most canvas-faithful frame snapshot     |

Examples:

```bash
# 1) Reusable icon/asset export (clean cutout)
node scripts/figma-get-images.mjs \
  --nodes <icon-node-id> \
  --format png \
  --scale 2 \
  --contents-only true \
  --use-absolute-bounds false

# 2) Include overlap context from nearby layers/effects (for example shadows)
node scripts/figma-get-images.mjs \
  --nodes <frame-node-id> \
  --format png \
  --scale 2 \
  --contents-only false \
  --use-absolute-bounds false

# 3) Preserve full node/frame bounds for exact placement
node scripts/figma-get-images.mjs \
  --nodes <text-or-frame-node-id> \
  --format png \
  --scale 2 \
  --contents-only true \
  --use-absolute-bounds true

# 4) Snapshot with both overlap context and full frame bounds
node scripts/figma-get-images.mjs \
  --nodes <frame-node-id> \
  --format png \
  --scale 2 \
  --contents-only false \
  --use-absolute-bounds true
```

### Output contract

- Bridge endpoint is fixed to `http://localhost:3851/v1/images`
- Exported files are always copied into `website/session/export`
- JSON is printed to stdout with request metadata, bridge response envelope, and copied file paths

## `figma-get-annotations.mjs`

Fetches annotations through the local image-exporter bridge HTTP API (`POST /v1/annotations/tree`).

Prerequisites:

- `image-exporter` bridge daemon running (default `http://localhost:3851`)
- Figma plugin connected to the daemon

### CLI contract

```bash
node scripts/figma-get-annotations.mjs \
  --id 123:456 \
  [--endpoint http://localhost:3851/v1/annotations/tree] \
  [--timeout-ms 30000] \
  [--load-all-pages true|false] \
  [--include-empty-nodes true|false] \
  [--include-categories true|false] \
  [--debug-raw]
```

Options:

- `--id`: single node ID (`123:456` or `123-456`) or full Figma URL containing `node-id` (required)
- `--endpoint`: annotations API endpoint URL (default `http://localhost:3851/v1/annotations/tree`)
- `--timeout-ms`: request timeout in milliseconds (default `30000`)
- `--load-all-pages`: boolean; include all pages before node lookup (default `true`)
- `--include-empty-nodes`: boolean; include nodes with empty annotation arrays in API traversal (default `false`)
- `--include-categories`: boolean; include annotation category metadata in API response (default `true`)
- `--[no-]debug-raw`: include raw bridge API response payload in output
- `--help`: print usage

The output includes:

- `request`: endpoint, normalized node ID, input source (`node-id` or `url`), timeout, and request body values
- `summary`: bridge request ID, traversal counts, category count, annotation counts, and duration
- `annotations`: flattened list of `figma.annotations` entries with node metadata and category/property details
- `debugRaw` (only with `--debug-raw`): full bridge response envelope

Output behavior:

- The script always writes YAML to `website/session/annotations/annotation.yaml`
- `stdout` prints only the saved file path

Notes:

- URL inputs are normalized from `node-id` query params (for example `?node-id=1256-20937` -> `1256:20937`).
- If the plugin is not connected, the API returns `503` with `PLUGIN_OFFLINE`.

## `landing-capture.mjs`

Fast Playwright screenshot capture utility for `http://localhost:3000` (or a custom `--url`).

Output directory is required via `--out`, and cannot be `session/browser` directly.

It can capture:

- A full-page screenshot
- A list of selector-level screenshots
- Both in one run

### CLI contract

```bash
node scripts/landing-capture.mjs \
  --out ./session/browser/run-01/hero \
  --mode both \
  --url http://localhost:3000 \
  --selectors "[data-role=\"hero-cta-primary\"],[data-section=\"hero\"]"
```

Options:

- `--url`: target URL (default `http://localhost:3000`)
- `--out`: output directory for screenshots and report (required); use a nested path like `session/browser/<run>/<step>`
- `--mode`: `full`, `selectors`, or `both` (default `full`)
- `--selectors`: comma-separated CSS selectors
- `--selectors-file`: path to a file with one selector per line (`#` comment lines are ignored)
- `--width`: viewport width (default `1440`)
- `--height`: viewport height (default `900`)
- `--device-scale-factor`: viewport scale factor (default `1`)
- `--wait-until`: `load`, `domcontentloaded`, `networkidle`, or `commit` (default `domcontentloaded`)
- `--wait-ms`: extra post-navigation wait in ms (default `0`)
- `--timeout-ms`: timeout for navigation and actions (default `30000`)
- `--[no-]headless`: run browser headless (default `true`)
- `--[no-]strict-selectors`: exit non-zero if any selector is missing/failed (default `false`)
- `--[no-]scroll-into-view`: scroll target into view before selector capture (default `true`)
- `--[no-]wait-for-fonts`: wait for `document.fonts.ready` before capture (default `false`)
- `--[no-]full-page`: use full-page mode for full screenshot (default `true`)
- `--help`: print usage

### Output contract

- `<out>/full.png`
- `<out>/selectors/*.png`
- `<out>/capture-report.json`

`stdout` prints only generated file paths (one path per line).

`capture-report.json` includes run metadata, full screenshot status/path, selector statuses, and summary counts.

## `image-compare.mjs`

Simple odiff wrapper that compares two images, writes a diff image, and exports a JSON report.

Output directory is required via `--out`, and cannot be `session/browser` directly.

### CLI contract

```bash
node scripts/image-compare.mjs \
  --left ./artifacts/current.png \
  --right ./artifacts/reference.png \
  --out ./session/browser/run-01/hero-diff
```

Options:

- `--left`: left/source image path (required)
- `--right`: right/reference image path (required)
- `--out`: output directory for diff image and report (required); use a nested path like `session/browser/<run>/<step>`
- `--[no-]fail-on-diff`: return exit code `2` when differences are found (default `false`)
- `--help`: print usage

### Output contract

- `<out>/diff.png` (diff image generated by `odiff`)
- `<out>/diff-report.json` (JSON report with odiff exit code, score/mismatch metrics, and stdout/stderr)

`stdout` prints only generated file paths (one path per line).
