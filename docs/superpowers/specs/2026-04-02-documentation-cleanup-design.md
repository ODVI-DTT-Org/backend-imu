# Documentation Cleanup Design

> **Date:** 2026-04-02
> **Status:** Approved
> **Author:** AI Agent
> **Type:** Documentation restructuring

---

## Overview

Restructure IMU project documentation to a minimal, focused structure. Remove outdated content, consolidate duplicates, and organize remaining docs by category.

---

## Current State

The IMU project has documentation scattered across multiple locations:
- Root level: 11 files (CLAUDE.md, AGENTS.md, plans, analysis docs)
- `docs/` root: 7 files (environment, quick references, API docs)
- `docs/architecture/`: 11 files (C4 models, state machines, flows)
- `docs/plans/`: 7 files (design and implementation plans)
- `docs/superpowers/`: 3 subdirectories (plans, specs, summaries, testing)
- `universal-project-docs/`: Template system
- `skills/`: Reusable skills

**Problems:**
1. Too many files at root level (11)
2. Implementation guides mixed with reference docs in `docs/`
3. Duplicate content (api-documentation.md vs architecture/api-contracts.md)
4. Outdated quick reference docs
5. No clear separation between active docs and completed analysis

---

## Target Structure

```
[repository root]
├── CLAUDE.md                      # Main entry point
├── AGENTS.md                      # Agent rules and patterns
├── learnings.md                    # Project decisions and knowledge
├── debug-log.md                    # Troubleshooting patterns
├── docs/
│   ├── ENVIRONMENT.md             # Environment variables
│   ├── architecture/              # System architecture (C4 models, flows)
│   ├── feature-analysis/          # Feature implementation analysis
│   ├── plans/                     # Design and implementation plans
│   └── superpowers/               # Specs, summaries, testing
├── universal-project-docs/        # Template system (not project docs)
└── skills/                        # Reusable skills
```

---

## Changes

### Root Level

**Keep (4 files):**
- `CLAUDE.md` - Main entry point
- `AGENTS.md` - Agent rules and patterns
- `learnings.md` - Project decisions and knowledge
- `debug-log.md` - Troubleshooting patterns

**Delete (1 file):**
- `UNIVERSAL_PROJECT_DOCS_GENERATOR.md` - Template system (45KB), not project-specific

**Move to `docs/feature-analysis/methodology/`:**
- `master_plan_mobile_tablet.md` - Flutter implementation plan (62 slices, completed)
- `elephant_carpaccio_v_3.md` - Vue Admin implementation (31 slices, completed)
- `elephant-carpaccio-version-2.md` - Development methodology
- `ELEPHANT_CARPACCIO_BACKEND.md` - Backend development methodology
- `vertical-slices-missing-features.md` - Missing feature tracking

**Move to `docs/feature-analysis/testing/`:**
- `IMU-Manual-Testing-Guide.md` - Manual testing procedures

**Move to `docs/feature-analysis/backend/`:**
- `backend-analysis-and-flow.md` - Backend architecture analysis
- `deep_analysis_new_tech-stack.md` - Tech stack analysis

---

### docs/ Root

**Keep (1 file):**
- `ENVIRONMENT.md` - Environment variables

**Keep `docs/architecture/` unchanged (11 files):**
- `README.md` - Architecture index
- `c4-context.md` - System context
- `c4-containers.md` - Container diagram
- `c4-components.md` - Component diagrams
- `state-machines.md` - State machines
- `user-flows.md` - User flows
- `data-flows.md` - Data flows
- `api-contracts.md` - API contracts
- `testing-strategy.md` - Testing approach
- `pre-mortem.md` - Risk assessment
- `VALIDATION_SUMMARY.md` - Validation results

**Delete (5 files):**
- `deep-analysis-on-project.md` - Content now in architecture README
- `DOCUMENTATION_QUICK_REFERENCE.md` - No longer needed
- `CODE_REVIEW_QUICK_REFERENCE.md` - Content in AGENTS.md
- `api-documentation.md` - Superseded by architecture/api-contracts.md
- `shared-schema.md` - Superseded by architecture docs

---

### docs/feature-analysis/ Structure

```
docs/feature-analysis/
├── methodology/
│   ├── master_plan_mobile_tablet.md
│   ├── elephant_carpaccio_v_3.md
│   ├── elephant-carpaccio-version-2.md
│   ├── ELEPHANT_CARPACCIO_BACKEND.md
│   └── vertical-slices-missing-features.md
├── powersync/
│   ├── powersync-setup.md
│   ├── powersync-jwt-setup-guide.md
│   └── powersync-production-setup-complete.md
├── authentication/
│   ├── offline-authentication-implementation.md
│   └── offline-authentication-visual-guide.md
├── file-upload/
│   ├── file-upload-implementation.md
│   └── file-upload-summary.md
├── maps/
│   └── maps-implementation-guide.md
├── loading-states/
│   ├── loading-states-implementation.md
│   ├── loading-states-phase-2-summary.md
│   ├── loading-states-phase-3-summary.md
│   ├── loading-states-complete-summary.md
│   └── global-loading-states-implementation.md
├── touchpoints/
│   └── touchpoint-sequence-validation.md
├── jwt/
│   └── jwt-token-generator.md
├── testing/
│   ├── testing-implementation-plan.md
│   ├── tele-role-e2e-testing-checklist.md
│   ├── tele-role-implementation-verification.md
│   ├── endpoint-test-log.md
│   └── IMU-Manual-Testing-Guide.md
├── database/
│   ├── database-normalization-analysis.md
│   └── database-normalization-progress.md
├── backend/
│   ├── backend-analysis-and-flow.md
│   ├── backend-architecture-updates.md
│   └── deep_analysis_new_tech-stack.md
├── audit/
│   └── audit-system-implementation.md
├── ux/
│   ├── ux-flow-analysis.md
│   ├── ux-mental-models-guide.md
│   └── web-app-map-gaps-analysis.md
└── gaps/
    ├── critical-gaps-analysis.md
    └── missing-endpoints.md
```

---

### Unchanged Directories

**Keep `docs/plans/` unchanged:**
- All existing design and implementation plans

**Keep `docs/superpowers/` unchanged:**
- `IMPLEMENTATION_SUMMARY.md`
- `plans/` - Implementation plans
- `specs/` - Design specs
- `summaries/` - Implementation summaries
- `testing/` - Testing checklists

**Keep `universal-project-docs/` unchanged:**
- Template system for generating AI-friendly documentation

**Keep `skills/` unchanged:**
- `scored-code-reviewer/` - Reusable skill

---

## Implementation Plan

### Phase 1: Create Directory Structure
Create all new subdirectories under `docs/feature-analysis/`

### Phase 2: Move Files
Move files from root and `docs/` root to their new locations

### Phase 3: Delete Obsolete Files
Delete files marked for deletion

### Phase 4: Update References
Update any cross-references between docs (if found)

### Phase 5: Commit
Commit all changes with descriptive message

---

## Risk Assessment

**Risk Level:** Low
- No code changes
- No functionality affected
- Purely file organization

**Rollback Plan:** Git revert if needed

---

## Success Criteria

- [ ] Root level has only 4 files (CLAUDE.md, AGENTS.md, learnings.md, debug-log.md)
- [ ] `docs/` root has only ENVIRONMENT.md and subdirectories
- [ ] All feature analysis docs organized in `docs/feature-analysis/`
- [ ] No duplicate content remaining
- [ ] All obsolete docs deleted
- [ ] Git commit completed

---

## Related Files

- Root: CLAUDE.md, AGENTS.md, learnings.md, debug-log.md
- docs/architecture/README.md
- docs/ENVIRONMENT.md
