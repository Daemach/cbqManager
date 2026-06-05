# cbqManager — Scaffold Map

This is the initial scaffold generated from the design in [CONTEXT.md](../CONTEXT.md),
[docs/adr/](adr/), and [docs/prd/0001-cbq-job-management.md](prd/0001-cbq-job-management.md).
Most module bodies are real; the trickier integration points are marked `TODO`.

## Backend (BoxLang / ColdBox)

```
app/
  Application bootstrap ............ public/Application.bx  (own-store datasource, env-driven; SQLite→MSSQL)
  config/
    Coldbox.bx ..................... custom settings (encryptionKey, harvest, poolDefaults)
    Router.bx ..................... cbqManager API routes (JWT secured)
    Scheduler.bx .................. Harvester, Archive purge, Orphan-heal guard tasks
  models/
    security/CredentialCipher.bx ... AES field encryption (ADR-0003)   [pure]
    security/Authorization.bx ...... RBAC + per-Connection scope (Q14)
    jobs/JobStateClassifier.bx ..... row → Job State incl. Orphan       [pure]
    jobs/MementoPayloadBuilder.bx .. failed job → cbq_jobs retry row    [pure] (ADR-0002)
    jobs/FailedJobEnricher.bx ...... parse fileName/line/sql app-side   [pure] (Q9)
    jobs/QueueHealthAnalyzer.bx .... 6 buckets + Next Up                [pure]
    jobs/PoolParamsInference.bx .... infer timeout; priority fallback   [pure] (Q17)
    db/QueryBuilderFactory.bx ...... per-Connection qb by grammar       (ADR-0005)
    connections/ConnectionRegistry.bx  encrypted Connection CRUD + resolve()
    repositories/JobRepository.bx .. guarded control writes            (ADR-0001/Q10)
    repositories/FailedJobRepository.bx  enriched reads + Memento retry
    repositories/BatchRepository.bx  cancel/delete/retry-failed/drilldown
    archive/Harvester.bx ........... snapshot terminal jobs + depth    (ADR-0004)
    archive/ArchiveRepository.bx ... long-memory store + retention
    audit/AuditLog.bx .............. append-only mutation log
    util/Clock.bx .................. injectable epoch (testable time)
  handlers/ ....................... BaseApiHandler + Connections/Jobs/FailedJobs/Batches/QueueHealth/Archive/Audit
resources/database/migrations/ .... own-store schema (cbqm_*)
```

### Backend prerequisites

1. Copy `.env.example` → `.env` and set **`CBQM_ENCRYPTION_KEY`** (`generateSecretKey("AES",256)`)
   and `JWT_SECRET`.
2. **App runtime SQLite driver**: `bx-sqlite` (BoxLang module) lets the *running app* talk to
   the SQLite own store. Swap to MSSQL via the `CBQM_DB_*` env vars.

### Migrations (DONE — `cbqm_*` tables created in `resources/db/cbqmanager.db`)

Connection config lives in **`.cfmigrations.json`** (NOT `box.json`); it uses the bundled qb,
which supports every grammar incl. `SQLiteGrammar@qb`.

The one non-obvious gotcha: `box migrate` runs in the CommandBox **Lucee CLI**, which loads JDBC
drivers as **OSGi bundles** — the BoxLang `bx-sqlite` jar is not one. Resolution (one-time):

1. Drop the official OSGi bundle into the CLI's Lucee bundle dir:
   `F:\CommandBox\engine\cfml\cli\lucee-server\bundles\org.xerial.sqlite-jdbc-3.45.3.0.jar`
   (from Maven Central `org/xerial/sqlite-jdbc/3.45.3.0`).
2. Point `.cfmigrations.json` `connectionInfo` at it with `bundleName` + `bundleVersion`
   (a class-only datasource fails — Lucee's core classloader can't see bundles):
   ```json
   "connectionInfo": {
     "class": "org.sqlite.JDBC",
     "bundleName": "org.xerial.sqlite-jdbc",
     "bundleVersion": "3.45.3.0",
     "connectionString": "jdbc:sqlite:./resources/db/cbqmanager.db"
   }
   ```
3. `box migrate install` then `box migrate up`.

For MSSQL later, the `org.lucee.mssql` bundle already ships with the CLI — just change
`.cfmigrations.json` + the `CBQM_DB_*` env vars.

### Running app — SQLite driver (separate from the migration CLI driver)

The BoxLang **server** needs `bx-sqlite` in the project's `boxlang_modules/` (the server's
`modulesDirectory` includes `${user-dir}/boxlang_modules`). NOTE: `box install bx-sqlite` lands
it in the *global* BoxLang home, which the per-server runtime does NOT load — copy it in:

```
box install bx-sqlite
cp -r <BOXLANG_HOME>/modules/bx-sqlite boxlang_modules/bx-sqlite
```

The own-store datasource (in `public/Application.bx`) uses BoxLang's `driver` + `database` keys
(NOT Lucee's `class`/`connectionString`): `{ driver: "sqlite", database: "<abs path>" }`.
`Application.bx` resolves the absolute path automatically; `.env` only overrides for MSSQL.

Also: `server.json` hardcoded the JDWP debug agent on port 8889 (collides with other BoxLang
servers) — moved to `127.0.0.1:18889`.

### Gotcha for repository code + tests

qb's `.first()` returns an **empty struct `{}`** (not null) when there is no row. Always guard
with `isNull( x ) || structIsEmpty( x )`, not just `isNull`. (Fixed in `Authorization` and
`FailedJobRepository`; sweep the rest when writing tests.)

### Auth & initial setup

- Users are a **Quick** entity (`app/models/User.bx`) mapped to `cbqm_users`, with passwords
  hashed by the **BCrypt** module (`@BCrypt`). `UserService` is Quick-backed for cbauth.
- **Easy initial setup**: on the first dev boot against an empty user table, `Main.onAppInit`
  auto-seeds a default admin — **`admin` / `password`** (role `admin`). Idempotent; dev-only.
- Login: `POST /api/login {username,password}` → JWT bearer token. Send it as
  `Authorization: Bearer <token>` on the `/api/...` routes. Admin passes all RBAC tiers.

### Verify (current local setup)
```
box server start          # BoxLang server on http://127.0.0.1:60472
curl -s http://127.0.0.1:60472/healthcheck                       # -> Ok!
curl -s http://127.0.0.1:60472/api/connections/1/health          # -> 403 (auth enforced; empty registry)
```

## Frontend (Vite + Vue 3 + Quasar)

```
frontend/
  src/
    services/api.js ............... JWT REST client (all endpoints)
    services/realtime/ ............ transport-agnostic adapter factory (pusher | socketbox) (ADR-0006)
    router/index.js ............... routes + auth guard
    layouts/MainLayout.vue ........ shell + Connection switcher
    views/ ........................ Login, Connections, QueueHealth (fleshed), Jobs, FailedJobs, Batches, Monitor
```

```
cd frontend
npm install
npm run dev               # Vite on :9000, proxies /api → :8080
```

## Notable TODOs left in code

- `QueryBuilderFactory.detectGrammar()` — real AutoDiscover probe; auto-retry grammar decorator.
- `JobRepository.throttledRelease()` — full per-window staggering (ROW_NUMBER over queue priority).
- `BatchRepository` JSON `$.batchId` extraction — per-grammar variants (currently SQL Server/MySQL).
- `ArchiveRepository.archiveJobs()` — grammar-portable upsert instead of per-row insert/catch.
- `affected()` helpers — confirm qb's result shape for insert/update/delete per grammar.
- Persisted User model + role accessor to replace the mock `UserService`.

## End-to-end tests (two first-class modes)

The E2E suite is designed to run **both** standalone (fast dev loop) and inside the single TestBox
report — so you can ideate quickly *and* get one unified pass/fail in CI.

- **Standalone (dev/ideation):** JS Playwright in `frontend/`.
  - `yarn --cwd frontend test:e2e` (headless), `…test:e2e:ui` (interactive), `…test:e2e:headed`.
  - Reusable helpers in `frontend/e2e/support/app.js` (login, error collectors); specs in `frontend/e2e/*.spec.js`.
  - Requires the Vite dev server (`:9000`) + ColdBox (`:60472`) running; default login `admin`/`password`.
- **Single suite (CI):** `tests/specs/e2e/PlaywrightBridgeSpec.bx` runs the same JS suite and reports
  pass/fail inside `box testbox run`. **Skipped by default**; enable with `RUN_E2E=true`.
  - Playwright emits `tests/results/playwright-junit.xml` (same dir as TestBox) so any aggregator
    unifies the report.
- Reference pattern (Playwright-Java specs in TestBox) can coexist under `tests/specs/e2e` if a
  fully-native BoxLang E2E is ever wanted.

> Note: the template's `tests/specs/unit/UserServiceTest.bx` + `UserTest.bx` assert the OLD mock
> (`admin/admin`, in-memory) and will fail against the Quick/bcrypt rewrite — update them next.

## Tests (per PRD — not yet written)

Target the deep modules: the pure ones (`*Classifier`, `*Builder`, `*Enricher`, `QueueHealthAnalyzer`,
`PoolParamsInference`, `CredentialCipher`) and the repositories against a **SQLite cbq_jobs fixture**
(guarded-write race-safety). See PRD "Testing Decisions".
