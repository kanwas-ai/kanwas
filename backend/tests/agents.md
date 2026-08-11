# Backend Tests Agent Notes

Use this file for test-specific guidance when working in `backend/tests`.

For the full backend test command guide, see `@../agents.md`.

## Running tests safely

Never run backend tests in parallel. Do not start multiple `pnpm test`, `pnpm test:agent`, or `NODE_ENV=test node ace test ...` commands against the same test database at the same time.

`backend/tests/bootstrap.ts` runs migrations before the suites execute. A second runner can block on migration locks or interfere with the first runner's setup. Always wait for one backend test command to finish before starting the next one.

From `backend/`, the standard test run is:

```bash
pnpm test
```

That script runs:

```bash
NODE_ENV=test node ace test unit functional
```

Use direct `node ace test` commands when you need Adonis/Japa filters:

If you are unsure which flags this repo's installed Adonis/Japa version supports, check the local CLI first:

```bash
NODE_ENV=test node ace test --help
```

```bash
# Run one suite
NODE_ENV=test node ace test unit
NODE_ENV=test node ace test functional

# Run by file, exact test title, exact group, or tag
NODE_ENV=test node ace test functional --files="tasks/index"
NODE_ENV=test node ace test unit functional --tests="can list all posts"
NODE_ENV=test node ace test functional --groups="Tasks - index"
NODE_ENV=test node ace test unit functional --tags="@db:commit"
NODE_ENV=test node ace test unit functional --tags="~@db:commit"

# Debugging helpers
NODE_ENV=test node ace test unit functional --failed
NODE_ENV=test node ace test unit functional --timeout=60000

# Focus watch mode on one file while iterating
NODE_ENV=test node ace test functional --watch --files="tasks/index"
```

AdonisJS/Japa filter basics: `--files` matches the end of the test filename without `.spec.ts`, `--tests` matches an exact test title, `--groups` matches an exact `test.group()` name, `--tags` includes tags, and `~tag` excludes tags. Reference: https://docs.adonisjs.com/guides/testing/introduction.

## Database isolation (default)

- Every `unit`, `functional`, and `e2e` test is automatically wrapped in a global DB transaction from `backend/tests/bootstrap.ts`.
- The transaction starts before each test and is rolled back after each test.
- This applies to grouped tests and top-level tests.

## What to do in new tests

- Do not add `testUtils.db().truncate()` in test setup.
- Do not add manual `db.beginGlobalTransaction()` / `db.rollbackGlobalTransaction()` in individual test files unless there is a very specific reason.
- Rely on the shared transaction hooks in `backend/tests/bootstrap.ts`.

## Opt-out when a test must observe real commits

Some tests need committed rows visible across separate connections/processes. For those, opt out of the per-test transaction using the tag `@db:commit`:

```ts
test('example that needs committed data', async ({ assert }) => {
  // test body
}).tags(['@db:commit'])
```

Use this sparingly. Transactional tests are the default because they are faster and avoid deadlocks caused by truncate-based cleanup.
