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

## Stage 2 — Backfill ETL  (not started)
## Stage 3 — Read switching + RBAC seed  (not started)
## Stage 4 — Mobile UX + PowerSync sync rules  (not started)
## Stage 5 — Cleanup  (not started)
