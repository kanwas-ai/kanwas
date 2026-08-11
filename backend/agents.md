# Backend Agent Notes

Use this file for backend-specific operating notes. `backend/CLAUDE.md` imports it with `@agents.md`.

## Running backend tests

The backend uses AdonisJS/Japa tests. The configured suites are in `backend/adonisrc.ts`:

- `unit` -> `tests/unit/**/*.spec(.ts|.js)` (plus `admin/backend/tests/unit` when the admin workspace package is present)
- `functional` -> `tests/functional/**/*.spec(.ts|.js)`

(The `agent` suite was removed with the built-in agent on the `local-first` branch.)

`backend/tests/bootstrap.ts` loads the Japa plugins, validates that `NODE_ENV=test`, runs migrations on the test database, starts the HTTP server for functional-style suites, and applies the shared test isolation hooks.

### Critical rule: one runner at a time

Never run backend tests in parallel. Do not start two backend test commands in different terminals, do not background a test command with `&`, and do not use `pnpm --parallel`, `pnpm -r test`, CI sharding, or a matrix that points multiple backend runners at the same test database.

Each test process runs migrations during bootstrap. Multiple processes against the same database can block each other on migration locks or leave one runner waiting on the other. Run one backend test process, wait for it to finish, then start the next command.

### Services

Backend tests expect postgres and redis to be available. From the project root:

```bash
docker-compose up -d postgres redis
```

Then run test commands from `backend/`.

### Default commands

```bash
# From backend/
pnpm test
```

`pnpm test` is the normal local/CI command for unit and functional tests. It is equivalent to:

```bash
NODE_ENV=test node ace test unit functional
```

### Focused test runs

Use `NODE_ENV=test node ace test ...` directly when you need suite or filter control.

If you are unsure which flags this repo's installed Adonis/Japa version supports, check the local CLI first:

```bash
NODE_ENV=test node ace test --help
```

```bash
# One suite
NODE_ENV=test node ace test unit
NODE_ENV=test node ace test functional

# Exact test title
NODE_ENV=test node ace test unit functional --tests="can list all posts"

# File filter. Matches the end of the filename without .spec.ts.
NODE_ENV=test node ace test functional --files="tasks/index"
NODE_ENV=test node ace test functional --files="tasks/*"

# Exact group name
NODE_ENV=test node ace test functional --groups="Tasks - index"

# Tags. Prefix with ~ to exclude a tag.
NODE_ENV=test node ace test unit functional --tags="@db:commit"
NODE_ENV=test node ace test unit functional --tags="~@db:commit"

# Debugging helpers
NODE_ENV=test node ace test unit functional --failed
NODE_ENV=test node ace test unit functional --timeout=60000

# Watch mode. Keep it focused to one file while iterating.
NODE_ENV=test node ace test functional --watch --files="tasks/index"
```

The AdonisJS testing guide documents the same Japa basics: tests are grouped into suites, `node ace test <suite>` runs a suite, `--tests`, `--files`, `--groups`, and `--tags` filter runs, `--watch` reruns during development, and `--failed` helps with debugging. See https://docs.adonisjs.com/guides/testing/introduction.

### Creating tests

Generate new tests with the suite name that matches `backend/adonisrc.ts`:

```bash
node ace make:test services/example --suite=unit
node ace make:test tasks/index --suite=functional
```

Keep unit tests under `backend/tests/unit` and request/API tests under `backend/tests/functional`.

### Database isolation

Most `unit`, `functional`, and `e2e` tests are wrapped in a global DB transaction by `backend/tests/bootstrap.ts` and rolled back after each test. Do not add truncate-based cleanup or manual global transactions in individual tests unless the test has a specific isolation need.

When a test must observe committed rows across separate connections or processes, opt out of the transaction with the `@db:commit` tag and keep that test as narrow as possible.
