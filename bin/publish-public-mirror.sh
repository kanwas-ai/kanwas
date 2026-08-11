#!/usr/bin/env bash
#
# Build a public mirror of the repo with private paths removed, then
# (optionally) force-push it to the public GitHub repo as a single squashed
# commit. History is intentionally not preserved.
#
# Reads .private at the repo root — one path (relative to repo root) per line.
# Strips the admin-backend workspace dep from backend/package.json and
# removes admin/* entries from pnpm-workspace.yaml, then regenerates the
# lockfile so the public tree installs cleanly.
#
# Usage:
#   bin/publish-public-mirror.sh [target-dir]            # build mirror only
#   bin/publish-public-mirror.sh --push [target-dir]     # build + force push
#
#   target-dir defaults to ~/projects/kanwas-public
#   push remote defaults to git@github.com:kanwas-ai/kanwas.git on branch master
set -euo pipefail

PUSH=0
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    --*) echo "unknown flag: $arg" >&2; exit 1 ;;
    *) TARGET="$arg" ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${TARGET:-$HOME/projects/kanwas-public}"
PUSH_REMOTE="${PUBLISH_REMOTE:-git@github.com:kanwas-ai/kanwas.git}"
PUSH_BRANCH="${PUBLISH_BRANCH:-master}"

if [[ -z "$TARGET" ]]; then
  echo "target dir is required" >&2
  exit 1
fi

if [[ ! -f "$REPO_ROOT/.private" ]]; then
  echo "missing $REPO_ROOT/.private" >&2
  exit 1
fi

echo "Publishing public mirror → $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"

# Copy everything tracked by git plus untracked non-ignored files (working tree state).
# Skips files that are tracked but currently deleted.
(
  cd "$REPO_ROOT"
  {
    git ls-files -z
    git ls-files --others --exclude-standard -z
  } | while IFS= read -r -d '' f; do
    [[ -e "$f" ]] && printf '%s\0' "$f"
  done
) | tar --null -C "$REPO_ROOT" -T - -cf - | tar -C "$TARGET" -xf -

# Strip private paths.
while IFS= read -r entry; do
  [[ -z "$entry" || "$entry" =~ ^# ]] && continue
  if [[ -e "$TARGET/$entry" ]]; then
    echo "  removing $entry"
    rm -rf "$TARGET/$entry"
  fi
done < "$REPO_ROOT/.private"

# Remove admin-backend workspace dep from backend/package.json.
node - "$TARGET" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const target = process.argv[2]
const pkgPath = path.join(target, 'backend/package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
if (pkg.dependencies && 'admin-backend' in pkg.dependencies) {
  delete pkg.dependencies['admin-backend']
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log('  stripped admin-backend dep from backend/package.json')
}
NODE

# Remove admin/* and website entries from pnpm-workspace.yaml.
node - "$TARGET" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const target = process.argv[2]
const ymlPath = path.join(target, 'pnpm-workspace.yaml')
const src = fs.readFileSync(ymlPath, 'utf8')
const out = src
  .split('\n')
  .filter((line) => !/^\s*-\s*(admin(\/[^\s]+)?|website)\s*$/.test(line))
  .join('\n')
if (out !== src) {
  fs.writeFileSync(ymlPath, out)
  console.log('  stripped admin/* and website from pnpm-workspace.yaml')
}
NODE

# Scrub remaining admin references from configs. The admin module is private,
# so the public mirror should have zero textual mention of it.
node - "$TARGET" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const target = process.argv[2]

const edits = [
  // Drop ADMIN_PATH/ADMIN_TOKEN-related lines and their leading comments.
  {
    file: 'backend/.env.example',
    transform: (src) => {
      const lines = src.split('\n')
      const drop = new Set()
      for (let i = 0; i < lines.length; i++) {
        if (/^ADMIN_(PATH|TOKEN)=/.test(lines[i])) {
          drop.add(i)
          for (let j = i - 1; j >= 0 && lines[j].startsWith('#') && lines[j].trim() !== ''; j--) drop.add(j)
        }
      }
      return lines
        .filter((_, i) => !drop.has(i))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
    },
  },
  // Remove the "Admin interface" comment block and its ADMIN_* env entries.
  {
    file: 'backend/start/env.ts',
    transform: (src) =>
      src.replace(
        /\n\s*\/\*\s*\n\s*\|-+\s*\n\s*\| Admin interface\s*\n\s*\|-+\s*\n\s*\*\/\s*\n(\s*ADMIN_(PATH|TOKEN):.*\n)+/m,
        '\n'
      ),
  },
  // Drop admin cleanup paths from the build-stage RUN, and the admin COPY.
  {
    file: 'backend/Dockerfile',
    transform: (src) =>
      src
        .replace(/ \\\n\s*\/app\/admin\/[^\n]*/g, '')
        .replace(/^COPY --from=build \/app\/admin .*\n/gm, ''),
  },
  // Drop ADMIN_PATH ARG and admin nginx location from frontend/Dockerfile.
  {
    file: 'frontend/Dockerfile',
    transform: (src) =>
      src
        .replace(/^ARG ADMIN_PATH=.*\n/gm, '')
        .replace(/\s*location \/\$\{ADMIN_PATH\}\/ \{[\s\S]*?\} \\\n/g, '\n'),
  },
  // Drop the ADMIN_BACKEND_PRESENT helper, the admin_routes preload, the
  // conditional admin tests glob, and the resources/admin metaFiles entry.
  {
    file: 'backend/adonisrc.ts',
    transform: (src) =>
      src
        .replace(/^import \{ existsSync \} from 'node:fs'\n/m, '')
        .replace(/^const ADMIN_BACKEND_PRESENT =.*\n\n?/m, '')
        .replace(/^\s*\(\) => import\('#start\/admin_routes'\),\n/m, '')
        .replace(
          /files: \[[\s\S]*?ADMIN_BACKEND_PRESENT[\s\S]*?\],/,
          "files: ['tests/unit/**/*.spec(.ts|.js)'],"
        )
        .replace(/\s*\{\s*pattern: 'resources\/admin\/\*\*',\s*reloadServer: false,\s*\},?\n?/, ''),
  },
  // Drop admin-asset ignores from eslint configs.
  {
    file: 'backend/eslint.config.js',
    transform: (src) => src.replace(/, 'resources\/admin\/assets\/\*\*'/g, ''),
  },
  {
    file: 'backend/.eslintignore',
    transform: (src) => src.replace(/^resources\/admin\/assets\n/gm, ''),
  },
  // Drop admin route entries from the generated Tuyau API. Each entry is a
  // top-level object literal in the routes array; we drop the whole block when
  // its `name` starts with `admin.`.
  {
    file: 'backend/.adonisjs/api.ts',
    transform: (src) => {
      const lines = src.split('\n')
      const out = []
      let i = 0
      while (i < lines.length) {
        if (lines[i] === '  {') {
          let j = i + 1
          while (j < lines.length && lines[j] !== '  },') j++
          const block = lines.slice(i, j + 1).join('\n')
          if (!/name: 'admin\./.test(block)) out.push(block)
          i = j + 1
        } else {
          out.push(lines[i])
          i++
        }
      }
      return out.join('\n')
    },
  },
]

for (const { file, transform } of edits) {
  const full = path.join(target, file)
  if (!fs.existsSync(full)) continue
  const before = fs.readFileSync(full, 'utf8')
  const after = transform(before)
  if (after !== before) {
    fs.writeFileSync(full, after)
    console.log(`  scrubbed admin references from ${file}`)
  }
}
NODE

# Regenerate lockfile so the public tree installs cleanly.
echo "Regenerating pnpm-lock.yaml"
( cd "$TARGET" && pnpm install --lockfile-only >/dev/null )

# Initialize a fresh git repo with a single squashed commit. History from the
# private repo is intentionally not carried over. The commit author is set to
# the publisher's GitHub noreply email so GitHub can link the commit to an
# account — without this, the contributor graph stays empty and co-authors
# don't render either. Co-authored-by trailers credit the rest of the team.
echo "Initializing git repo"
(
  cd "$TARGET"
  git init -q -b "$PUSH_BRANCH"
  git add -A
  GIT_AUTHOR_NAME="Marek Vybíral" \
  GIT_AUTHOR_EMAIL="5180599+marek-vybiral@users.noreply.github.com" \
  GIT_COMMITTER_NAME="Marek Vybíral" \
  GIT_COMMITTER_EMAIL="5180599+marek-vybiral@users.noreply.github.com" \
  git commit -q -m "init

Co-authored-by: Predrag Ristic <13081502+Ryner01@users.noreply.github.com>
Co-authored-by: popovicanja <56150590+popovicanja@users.noreply.github.com>
Co-authored-by: Johan Cutych <5963309+johancutych@users.noreply.github.com>"
)

if [[ "$PUSH" == "1" ]]; then
  echo "Force-pushing to $PUSH_REMOTE ($PUSH_BRANCH)"
  (
    cd "$TARGET"
    git remote add origin "$PUSH_REMOTE"
    git push -f origin "$PUSH_BRANCH"
  )
fi

echo "Done."
