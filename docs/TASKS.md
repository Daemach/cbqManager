# cbqManager — UI Build & Test Task List

Goal: every UI element fully implemented, wired to the API, and covered by a passing test
(Playwright E2E for UI/flows, TestBox for backend logic). Each task is a single, independently
verifiable unit: build it, test it, check it off.

## Conventions

- **Test each task before checking it off.** UI flow → Playwright spec in `frontend/e2e/`;
  backend logic → TestBox spec in `tests/specs/`.
- **Reusable test scaffolding** lives in `frontend/e2e/support/` (`app.js` UI helpers,
  `api.js` API helpers). Add page-object helpers there, keep specs declarative.
- **Capture runs:** `yarn --cwd frontend test:e2e` (normal) or `test:e2e:capture` to save a
  **video + full trace** (console + network logs) for every test under `frontend/test-results/`.
  HTML report: `test:e2e:report`. JUnit → `tests/results/` for the TestBox single-suite bridge.
- **Single suite:** `RUN_E2E=true box testbox run` folds E2E into the TestBox report.
- **Dev fixtures** (real local target) come from `.env`: `FTDI_QUEUE_*` (SQL Server cbq DB on
  `maczilla`) and `PUSHER_*` (development channel). Never commit real values.
- **No disabled placeholders** may remain at the end — every button/field is functional or removed.

---

## Phase 0 — Test infrastructure ✅

- [x] Playwright config: `PW_CAPTURE` flag → video + trace for every test; artifacts to `test-results/`.
- [x] `.env` loaded into specs (dotenv) so they can use real dev-fixture creds.
- [x] `test:e2e:capture` script (cross-env); JUnit + HTML reporters; TestBox bridge spec.
- [x] Reusable helpers `frontend/e2e/support/{app,api}.js`.

## Phase 1 — Runtime reach + dev fixtures

- [ ] **MSSQL driver for the app runtime** so cbqManager can connect to `FTDIQueue` (SQL Server).
      Install `bx-mssql` and load it into `boxlang_modules/` (same pattern as `bx-sqlite`).
      Verify: a runtime query against `FTDIQueue` succeeds.
- [ ] **Broadcast Connection backend** — finish `ConnectionRegistry.createBroadcast/updateBroadcast/
      resolveBroadcast/listBroadcast` (+ encrypt Pusher secret). TestBox: create/resolve round-trip.
- [ ] **Dev seeder** (dev-only, idempotent) — from `.env`, upsert: a `pusher` Broadcast Connection
      (development channel) and a `development` Connection pointing at `FTDIQueue` (SqlServer grammar,
      encrypted creds, referencing the broadcast). Run on app init or a `/dev/seed` action.
      TestBox: seeder creates exactly one of each, re-run is a no-op.

## Phase 2 — Connections CRUD UI  (login / create / edit / delete)

- [ ] **Login** — already works; formalize spec (valid, invalid, logout). Playwright ✅ exists; extend with logout.
- [ ] **Connections list** — wire `ConnectionsView` to `GET /api/connections`; show env, engine, active, broadcast.
      Playwright: list renders seeded dev connection.
- [ ] **Create Connection dialog** — enable the (currently disabled) "Add Connection"; form with name,
      environment, grammar (auto-detect + override), tableName, datasourceClass, connectionString,
      secrets {username,password}, broadcast connection + channel, pool params. `POST /api/connections`.
      Playwright: create the FTDIQueue dev connection from `.env`; assert it appears; **assert secrets never leak**.
- [ ] **Edit Connection** — open dialog pre-filled (no secrets shown), `PUT /api/connections/:id`;
      optional "change secrets". Playwright: edit name/env, persist, re-open shows new values.
- [ ] **Delete Connection** — confirm dialog, `DELETE /api/connections/:id`. Playwright: delete, gone from list.
- [ ] **Test Connection** — a "Test" action that validates connectivity (probe the target). Backend
      endpoint + UI feedback. Playwright: test the dev connection → success; a bad one → failure.
- [ ] TestBox: `ConnectionRegistry` create/update/remove/resolve + `CredentialCipher` round-trip + no-leak.

## Phase 3 — Broadcast Connections UI

- [ ] **Broadcast list/create/edit/delete** UI (transport pusher|socketbox, server creds, channel).
      Wire to the Phase-1 backend. Playwright CRUD; assert Pusher secret never leaks.

## Phase 4 — Queue Health view

- [ ] Wire `QueueHealthView` to `GET /api/connections/:id/health` (already partly built); per-queue
      buckets, orphan banner, Heal/Park/Release actions enabled. Playwright: against the real dev
      connection, health renders; Heal/Park/Release call through (assert affected-count response).
- [ ] TestBox: `QueueHealthAnalyzer` buckets + Next Up + orphan detection (fixtures). 

## Phase 5 — Jobs browser + control actions

- [ ] Wire `JobsView`: server-paginated table, filter by queue, Job State column, **Next Up** highlight.
- [ ] Row actions: complete / reset / quarantine / delete with reservation-age warnings on reserved rows.
- [ ] Queue-wide: heal / park / throttled-release / discard-stale with dry-run preview.
- [ ] Playwright: list + each control action against a fixture/dev connection (assert affected counts, no-op safety).
- [ ] TestBox: `JobRepository` guarded writes against a SQLite `cbq_jobs` fixture (race-safety no-ops).

## Phase 6 — Failed Jobs

- [ ] Wire `FailedJobsView`: enriched columns (mapping, file:line, exception), filter; retry / retry+delete / delete.
- [ ] Playwright: list, retry (assert re-queued), delete. TestBox: `FailedJobRepository` + `FailedJobEnricher` + `MementoPayloadBuilder`.

## Phase 7 — Batches

- [ ] Wire `BatchesView`: progress, cancel / retry-failed / delete; drill into a batch's live jobs (payload `$.batchId`).
- [ ] Playwright + TestBox: `BatchRepository` cancel/drilldown/retry-failed.

## Phase 8 — Live Monitor

- [ ] Wire `MonitorView`: load the selected Connection's Broadcast Connection + channel, subscribe via the
      pusher|socketbox adapter, stream worker activity; pause/resume.
- [ ] Playwright: subscribe to the development Pusher channel; trigger a test event (server-side Pusher
      publish or a `/dev/ping` action) and assert it appears in the monitor. Save video for this one.

## Phase 9 — Full UI sweep

- [ ] Audit every view: no `disable` placeholders remain; every button/field wired + tested.
- [ ] Connection switcher, logout, error toasts, loading states all covered.
- [ ] Full run green: `box testbox run` + `RUN_E2E=true` E2E, with `test:e2e:capture` artifacts archived.

---

## Backend follow-ups surfaced earlier (fold in as encountered)

- [ ] `ConnectionRegistry.create` returns `result.result.generatedKey` — confirm across grammars (works on SQLite).
- [ ] Sweep remaining `.first()`-returns-`{}` guards in repositories (Authorization + FailedJob done).
- [ ] `JobRepository.throttledRelease` full per-window staggering; per-grammar JSON `$.batchId` extraction.
- [ ] `QueryBuilderFactory.detectGrammar` real probe; auto-retry grammar decorator.
