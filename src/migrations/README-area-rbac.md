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
## Stage 3 — Read switching + RBAC seed  (not started)
## Stage 4 — Mobile UX + PowerSync sync rules  (not started)
## Stage 5 — Cleanup  (not started)
