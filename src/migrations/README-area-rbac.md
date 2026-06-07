# Area-Based RBAC — Migration Tracker

Spec: `docs/superpowers/specs/2026-06-07-area-rbac-group-assignment-design.md`

## Stage 1 — Additive Schema  ✅ DONE

- `120_create_group_role_members.sql` — new role-aware membership table
- `121_create_group_caravan_municipalities.sql` — caravan slice, (province, municipality) composite
- `122_create_assignment_audit.sql` — audit trail
- `123_alter_group_municipalities_softdelete.sql` — add deleted_at + assigned_by + assigned_at to existing pool table
- `124_create_group_invariant_triggers.sql` — three invariant triggers

No production code reads/writes these tables yet. They are inert.

The legacy `group_members` table (45 rows, `client_id` schema) is untouched.
Deprecated in Stage 5 after Stage 2 backfills its rows into
`group_role_members(role_in_group='caravan')`.

### Follow-up flagged for Stage 3

Because migration 123 added `deleted_at` to `group_municipalities`, every existing
read query against this table must be audited to add `WHERE deleted_at IS NULL`
before any write path is allowed to soft-delete a pool row. Current call sites
(grep `group_municipalities` in `backend-imu/src/`):

- `routes/groups.ts`
- `routes/dashboard.ts`
- `queues/processors/reports-processor.ts`
- `queues/processors/handlers/itinerary-analysis-handler.ts`
- `schema.sql`

Stage 1 ships with NO writer that soft-deletes pool rows — so this is dormant.

## Stage 2 — Backfill ETL  ✅ DONE

- `125_backfill_group_role_members.sql` — area heads, asst, TLs, caravans
- `126_backfill_group_municipalities.sql` — pool derived from caravan user_locations
- `127_backfill_group_caravan_municipalities.sql` — slices derived from user_locations

Source: `backend-imu/scripts/area-rbac/cuecard-assignments.json` for TL identification
(cue card "as of 5.5.26"); other roles came from `groups.{area_manager_id,
assistant_area_manager_id}` and legacy `group_members.client_id`.

Final counts (verified 2026-06-07):
- area_head: 6, assistant_area_head: 2, team_leader: 8, caravan: 29
- group_municipalities pool: 1129 rows (17–292 per group)
- group_caravan_municipalities slices: 1378 rows across 29 caravans

Note: Plan expected caravan=37 (45 group_members − 8 TL). Actual is 29 because
all 6 AH and 2 AAH are also in group_members (16 elevated overlap, not 8).
Assertion bounds widened to 25-45 in migration 125 and the test.

Legacy `group_members` table still untouched. Stage 5 will drop it.
## Stage 3a — Read switching + RBAC seed  ✅ DONE (2026-06-08)

### Migrations

- `128_create_group_role_members_mirror_triggers.sql` — mirror triggers from
  legacy `group_members` and `groups.{area_manager_id, assistant_area_manager_id}`
  into `group_role_members`. Keeps the existing Vue admin UI producing valid RBAC
  data without any UI changes. (commits 33df535, 04ad431)
- `129_seed_area_rbac_permissions.sql` — additive: inserts 10 new `permissions`
  rows with `constraint_name IN ('group_municipalities', 'caravan_municipalities')`
  and 21 new `role_permissions` links. Existing `'own'`/`'area'`/`'all'` rows and
  their links are LEFT IN PLACE so `requirePermission()` middleware keeps working.

### New helper

- `src/utils/scope.ts` — `resolveClientScope(userId)` + `applyClientScope()`.
  Reads ONLY the new vocabulary from `role_permissions`. Precedence: new vocab
  wins over legacy `'all'` (critical: area_manager and asst have both, so new-
  vocab-first ensures they get `group_municipalities`, not `unrestricted`). If no
  matching row → `denied` → zero rows (safe fallback).

### Routes switched

- `src/routes/clients.ts` — 3 sites replaced: `/nearby`, `/pipeline`, `/assigned`.
  Deleted inline `ROLE_LEVELS` maps and `user_locations`-based PSGC filter in all
  three. Now calls `resolveClientScope` + `applyClientScope` at each site.
- `src/routes/itineraries.ts` — 1 site replaced: itinerary suggestions endpoint.

### Audit

- `src/queues/processors/reports-processor.ts` — added `WHERE gm.deleted_at IS NULL`
  to the `group_municipalities` read in the assigned_group CTE. (Task 7)

### Tests

- `test/migrations/group-mirror-triggers.test.ts` — 7 scenarios for mirror trigger
  behavior (INSERT/DELETE/UPDATE/idempotency).
- `test/utils/scope.test.ts` — 9 tests: SQL-splicing unit tests + prod-DB integration.
- `test/routes/clients-rbac.test.ts` — 5 smoke tests: admin unrestricted, caravan
  scoped, area_manager scoped (NOT unrestricted — key precedence regression guard),
  isolation check, orphan-row check.

### Key adjustment vs. plan

The plan's Task 4 helper used `'all'-wins` precedence, which would have treated
`area_manager` (which has both a legacy `'all'` link AND the new
`'group_municipalities'` link) as unrestricted. Fixed with new-vocabulary-first
precedence (`caravan_municipalities` → `group_municipalities` → `'all'/NULL`).
Only `admin` (which was intentionally skipped from new-vocab seeding) reaches
the `'all'` fallback → unrestricted.

### Stage 3b — next

New group management API endpoints in `routes/groups.ts` (POST members, POST
caravans, PATCH caravans/municipalities, DELETE caravans). The feature flag
`manageTeamWritesEnabled` in the Flutter app remains `false` until Stage 3b lands.

## Stage 3b — Group management endpoints  ✅ DONE (2026-06-08)

### New utility
- `src/utils/assignment-audit.ts` — `writeAssignmentAudit()` helper, writes one row
  to `assignment_audit` on every successful mutation.

### Routes appended to `src/routes/groups.ts` (lines 823+)
- `POST   /:id/role-members` — admin-only; assigns `area_head` / `assistant_area_head` / `tele`
- `DELETE /:id/role-members/:userId/:role` — admin-only; soft-delete a role membership
- `POST   /:id/team-leaders` — admin or area_head; inserts `team_leader` row
- `DELETE /:id/team-leaders/:userId` — admin or area_head; soft-delete TL
- `POST   /:id/caravans` — admin / area_head / asst / TL; caravan + initial slice
- `PATCH  /:id/caravans/:userId/municipalities` — full-replace slice (diff + soft-delete + insert)
- `DELETE /:id/caravans/:userId` — soft-delete caravan membership + all slices atomically

Existing 12 endpoints (lines 1–822) UNTOUCHED. Paths are distinct from legacy
`POST /:id/members` to avoid routing collisions.

### Error mapping
- `err.message?.includes('municipality_not_in_group_pool')` → 400 ValidationError
- `err.code === '23505' && constraint.includes('one_group_for_tl')` → 400 ValidationError
- `err.code === '23505' && constraint.includes('one_group_for_caravan')` → 400 ValidationError
- `rowCount === 0` on DELETE → 404 NotFoundError
- Non-member actor → 401 AuthenticationError (via `ensureGroupAccess`)

### Adjustments vs. plan
- `ValidationError(msg, details)` is single-arg in this codebase; used `.addDetail()` chaining.
- `c.req.param()` returns `string | undefined` in this Hono version; added `?? ''` null coalescing.
- Tests use direct DB queries rather than HTTP (authMiddleware requires POWERSYNC_PUBLIC_KEY
  at import time, making in-process Hono setup impractical for CI). Existing test pattern
  in `clients-rbac.test.ts` uses the same approach.

### Tests
- `test/routes/groups-caravans.test.ts` — 7 tests: trigger validation, valid insert,
  cardinality block, PATCH diff logic, DELETE atomicity, access control, orphan check
- `test/routes/groups-team-leaders.test.ts` — 6 tests: happy path, cardinality, remove,
  not-found, access check, orphan check
- `test/routes/groups-role-members.test.ts` — 7 tests: assign, idempotency, delete,
  invalid role, not-found, admin check, orphan check

All 20 tests pass. Orphan count = 0 after each run.

### Next: Stage 4a-write
## Stage 4a — Mobile read foundation  ✅ DONE

Sync rules added for `group_role_members`, `group_municipalities`,
`group_caravan_municipalities` (additive — no impact on existing tables).
Mobile gains `RoleProvider` + Manage Team screen (read-only display).
`ClientApiService.fetchAssignedClients()` upserts results into local PowerSync
as a bridge to Stage 4b.

Feature flag `manageTeamWritesEnabled` is `false` by default — slice editor's
Save button is disabled with a "Coming soon" tooltip until Stage 3 backend
endpoints ship.

**Manual deploy step:** The new sync rule blocks must be pushed to PowerSync
Cloud (via the PowerSync console or CLI). Until that happens, mobile devices
see empty `group_role_members` etc., and the Manage Team tab won't appear.

Feature flag location:
`frontend-mobile-imu/imu_flutter/lib/features/manage_team/presentation/caravan_slice_editor.dart`
— `const bool manageTeamWritesEnabled = false` at top of file. Flip to `true`
to enable write mutations once Stage 3 backend endpoints are live.

## Stage 4a-write — Manage Team mutations  ✅ DONE (2026-06-08)

Wires the slice editor's Save button to the Stage 3b PATCH endpoint, adds an
offline mutation queue, and flips `manageTeamWritesEnabled` to `true`.

### New files (frontend-mobile-imu, `area-rbac` branch)
- `imu_flutter/lib/features/manage_team/data/models/pending_assignment.dart`
- `imu_flutter/lib/features/manage_team/data/repositories/pending_assignments_repository.dart`
- `imu_flutter/lib/features/manage_team/data/services/team_api_service.dart`
- `imu_flutter/lib/features/manage_team/data/services/pending_replay_service.dart`

### Modified files
- `imu_flutter/lib/services/sync/powersync_service.dart` — added `pending_assignments`
  table to local PowerSync schema (no server sync rule → local-only queue)
- `imu_flutter/lib/features/manage_team/data/repositories/team_repository.dart` — added
  5 write methods: `replaceCaravanMunicipalities`, `addCaravan`, `removeCaravan`,
  `addTeamLeader`, `removeTeamLeader`
- `imu_flutter/lib/features/manage_team/presentation/caravan_slice_editor.dart` — flipped
  `manageTeamWritesEnabled = true`; implemented `_onSave()` wired to TeamRepository;
  added `_collectCheckedMunicipalities()` using existing `_selected` Set<String>
- `imu_flutter/lib/features/manage_team/presentation/manage_team_page.dart` — pending
  count map, pull-to-refresh triggers PendingReplayService, refreshes list after editor save
- `imu_flutter/lib/features/manage_team/presentation/widgets/caravan_row.dart` — added
  optional `pendingCount` parameter with amber "Pending sync" chip badge

### Tests
- `imu_flutter/test/features/manage_team/team_api_service_test.dart` — isNetworkError
  classification, URL patterns, ApiException shape
- `imu_flutter/test/features/manage_team/pending_replay_test.dart` — PendingAssignment
  fromRow, endpoint parsing, payload JSON round-trip, result record shape

### Architecture notes
- Network failures are silently queued; server-side rejections (4xx) surface to UI via SnackBar
- User-triggered replay only (pull-to-refresh); no automatic background retry
- Idempotency keys prevent duplicate writes on aggressive replays
- No new pub dependencies — uses existing Dio, JwtAuthService, PowerSync

### Next: Stage 4b

## Stage 4b — Narrow clients sync rule  ✅ YAML COMMITTED (deploy pending) (2026-06-08)

Modifies the `clients` sync rule in `docs/powersync-sync-rules.yaml` (both
`backend-imu` and `frontend-web-imu`) to push only the assigned subset per user.

### What changed

The "Core client data" SELECT in `clients:` gained a WHERE clause with three arms:
- `admin`: unrestricted (EXISTS check on `users.role = 'admin'`)
- `caravan`: only clients whose `(province, municipality)` is in their
  `group_caravan_municipalities` slice
- `area_head / assistant_area_head / team_leader / tele`: clients whose
  `(province, municipality)` is in their `group_municipalities` pool (via
  `group_role_members` JOIN)

`c.province` added to the SELECT (it was missing from the original rule).

### Verification queries (run 2026-06-08 against prod)

| Metric | Count |
|--------|-------|
| Caravan-visible clients (sample caravan user) | 2,496 |
| Area-head-visible clients (sample area_head user) | 22,092 |
| Total clients in DB | 311,419 |

Caravan sees ~0.8% of total — well within expected single-digit-percent territory.
Area-head sees ~7.1% of total.

### Commits

- `backend-imu` area-rbac branch: `b72d9e5` — feat(sync): narrow clients sync rule to area-rbac scope (stage 4b)
- `frontend-web-imu` area-rbac branch: `057083a` — feat(sync): narrow clients sync rule to area-rbac scope (stage 4b)

### MANUAL DEPLOY STEP REQUIRED

Until someone uploads the updated `docs/powersync-sync-rules.yaml` to the
PowerSync Cloud console, production sync still delivers all 311k clients to
every device. The YAML commits are the safe testing window before flip.

Steps:
1. Copy `backend-imu/docs/powersync-sync-rules.yaml` from the `area-rbac` branch
2. Upload via PowerSync Cloud console (or CLI) to your PowerSync instance
3. PowerSync will re-sync all active devices with the narrowed rule

### Adjustment vs. plan

The plan's SQL comments used `--` SQL comment syntax inline in YAML block
scalars. YAML's parser treats `-- key: value` as a mapping, causing a parse
error. The SQL inline comments were removed (three `-- admin:`, `-- caravan:`,
`-- managers + tele:` comment lines stripped). SQL logic is identical.

## Stage 5 — Cleanup  (not started)
