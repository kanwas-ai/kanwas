# Website Agent Notes

## Font Loading Rules (Critical)

- Be deliberate about which fonts, weights, and styles are used above the fold vs below the fold.
- Any time typography changes, update font loading in `src/app/layout.tsx`.
- Keep only above-the-fold variants preloaded.
- Keep below-the-fold variants available, but do not preload them (`preload: false`).
- If a section moves above the fold, promote its required font variants in `layout.tsx`.
- If a variant is only used below the fold, demote it from preload in `layout.tsx`.
