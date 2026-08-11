# Kanwas landing page

Static Next.js + Tailwind port of the Webflow landing page.

## Development

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Visual parity workflow

1. Start the dev server (`pnpm dev`).
2. In another terminal from `website/`, run Playwright:

```bash
pnpm dlx playwright test --reporter=html
```

- Baselines live in `website/visual-baseline/kanwas.ai` and are compared against the local app by default.
- Set `PARITY_BASE_URL` to compare a different host.
- Set `PARITY_RANDOM_SEED` to control fragment shatter randomness (default: 1337).
- Breakpoints: 1920, 1440, 1024, 768, 375. Hover snapshots are 1920-only.

To open the diff report:

```bash
pnpm dlx playwright show-report
```

To refresh baselines from production:

```bash
PARITY_BASE_URL=https://kanwas.ai pnpm dlx playwright test --update-snapshots --reporter=html
```

Optional hover-only baseline capture (writes PNGs directly):

```bash
PARITY_BASE_URL=https://kanwas.ai pnpm dlx playwright test visual-baseline/hover-baseline.spec.js
```

## Project layout

- `website/src/app/page.tsx`: landing page assembly.
- `website/src/components/landing/`: section components and hover behaviors.
- `website/public/landing/images/`: Webflow-exported assets.
- `website/visual-baseline/`: Playwright parity specs and baseline images.
