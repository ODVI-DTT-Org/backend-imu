# Universal Project Documentation Generator - Implementation Plan

> **For agentic workers:** Use checkbox (`- [ ]`) syntax for tracking tasks.

**Goal:** Create a modular template system that generates comprehensive AI-friendly project documentation

**Architecture:** Base templates + optional project-type modules + orchestrator generators

**Tech Stack:** Markdown templates, Mermaid diagrams

---

## Phase 1: Core Templates

### Task 1: Create directory structure

- [ ] Create `universal-project-docs/` directory
- [ ] Create subdirectories: core/, architecture/, project-types/, generators/, examples/
- [ ] Commit: "feat: create universal-project-docs directory structure"

### Task 2: Write agents-template.md

- [ ] Write AGENTS.md base template to `universal-project-docs/core/agents-template.md`
- [ ] Verify file created
- [ ] Commit: "feat: add AGENTS.md base template"

### Task 3: Write learnings-template.md

- [ ] Write learnings.md template to `universal-project-docs/core/learnings-template.md`
- [ ] Verify file created
- [ ] Commit: "feat: add learnings.md template"

### Task 4: Write debug-log-template.md

- [ ] Write debug-log.md template to `universal-project-docs/core/debug-log-template.md`
- [ ] Verify file created
- [ ] Commit: "feat: add debug-log.md template"

---

## Phase 2: Architecture Modules

### Task 5: Write c4-models.md

- [ ] Write C4 model generator to `universal-project-docs/architecture/c4-models.md`
- [ ] Verify file created
- [ ] Commit: "feat: add C4 model generator"

### Task 6: Write state-flows.md

- [ ] Write state/flow generator to `universal-project-docs/architecture/state-flows.md`
- [ ] Verify file created
- [ ] Commit: "feat: add state flows generator"

### Task 7: Write api-contracts.md

- [ ] Write API contracts generator to `universal-project-docs/architecture/api-contracts.md`
- [ ] Verify file created
- [ ] Commit: "feat: add API contracts generator"

---

## Phase 3: Project-Type Modules

### Task 8: Write flutter-mobile.md

- [ ] Write Flutter module to `universal-project-docs/project-types/flutter-mobile.md`
- [ ] Verify file created
- [ ] Commit: "feat: add Flutter project-type module"

### Task 9: Write vue-web.md

- [ ] Write Vue module to `universal-project-docs/project-types/vue-web.md`
- [ ] Verify file created
- [ ] Commit: "feat: add Vue web project-type module"

### Task 10: Write nestjs-backend.md

- [ ] Write NestJS module to `universal-project-docs/project-types/nestjs-backend.md`
- [ ] Verify file created
- [ ] Commit: "feat: add NestJS backend project-type module"

---

## Phase 4: Generators

### Task 11: Write full-docs.md

- [ ] Write full generator to `universal-project-docs/generators/full-docs.md`
- [ ] Verify file created
- [ ] Commit: "feat: add full documentation generator"

### Task 12: Write quick-start.md

- [ ] Write quick-start generator to `universal-project-docs/generators/quick-start.md`
- [ ] Verify file created
- [ ] Commit: "feat: add quick-start generator"

### Task 13: Write architecture-only.md

- [ ] Write architecture-only generator to `universal-project-docs/generators/architecture-only.md`
- [ ] Verify file created
- [ ] Commit: "feat: add architecture-only generator"

---

## Phase 5: Root Documentation

### Task 14: Write README.md

- [ ] Write README to `universal-project-docs/README.md`
- [ ] Verify file created
- [ ] Commit: "feat: add README for universal-project-docs"

### Task 15: Write CLAUDE.md

- [ ] Write CLAUDE.md to `universal-project-docs/CLAUDE.md`
- [ ] Verify file created
- [ ] Commit: "feat: add CLAUDE.md for universal-project-docs"

---

## Phase 6: Apply to IMU

### Task 16: Generate IMU's AGENTS.md

- [ ] Generate AGENTS.md at project root
- [ ] Update CLAUDE.md to reference AGENTS.md
- [ ] Commit: "docs: add AGENTS.md for IMU project"

### Task 17: Create IMU's learnings.md

- [ ] Create learnings.md at project root with initial content
- [ ] Commit: "docs: add learnings.md with IMU project decisions"

### Task 18: Create IMU's debug-log.md

- [ ] Create debug-log.md at project root with initial content
- [ ] Commit: "docs: add debug-log.md with IMU project issues"

---

## Phase 7: Finalization

### Task 19: Final verification and commit

- [ ] Verify all files created
- [ ] Final commit with complete summary
- [ ] Mark implementation complete
