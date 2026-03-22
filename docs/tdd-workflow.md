# TDD Workflow — Agent-Driven Development

This document defines how services are implemented in this project. It is
designed for both human orchestrators and AI agents operating within Claude Code.

## Core Principle

**Context isolation between test-writing and implementation.** When the same
agent writes both tests and code, it produces tests that verify its own broken
assumptions. Separating these into distinct agents with independent context
windows enforces genuine test-first discipline.

## The Workflow

Every service follows this loop:

```
1. Human selects next service from the implementation order
2. TEST-WRITER agent    → translates specs into failing Vitest tests (RED)
3. IMPLEMENTER agent    → writes minimal code to pass all tests (GREEN)
4. Human reviews the result
```

### Why This Works for This Project

The behavioral test specs already exist in `docs/architecture-and-tests.md` as
60+ GIVEN/WHEN/THEN scenarios. The test-writer agent does not invent tests — it
translates existing specs into executable Vitest cases. This eliminates the
"test generation bottleneck" identified in the research (TDFlow, arXiv 2510.23761).

The service interfaces already exist in `src/services/interfaces.ts`. The
implementer agent does not design APIs — it implements a known contract until
the tests pass.

## Phase 1: RED (Test-Writer Agent)

**Input:** The relevant test spec section from `docs/architecture-and-tests.md`
and the service interface from `src/services/interfaces.ts`.

**Output:** A test file at `src/services/<name>.test.ts` where all tests fail
for the right reasons (missing implementation, not syntax errors).

**Rules:**
- Read the GIVEN/WHEN/THEN specs for the target service
- Read the service interface and domain models it depends on
- Write Vitest tests using `describe`/`it`/`expect`
- Use GIVEN/WHEN/THEN as comments within each test for traceability
- Create mocks/stubs for dependencies (e.g., mock AI API for TranslationService)
- Import from the implementation file path (it won't exist yet — that's expected)
- Run the tests and confirm they fail
- Do NOT write any implementation code
- Do NOT look at other service implementations for "inspiration" — this pollutes context

**Test structure convention:**
```typescript
describe('ServiceName', () => {
  describe('section name from spec', () => {
    it('test name from spec', () => {
      // GIVEN ...
      // WHEN ...
      // THEN ...
    });
  });
});
```

## Phase 2: GREEN (Implementer Agent)

**Input:** The failing test file and the service interface.

**Output:** A service implementation at `src/services/<name>.ts` that passes
all tests.

**Rules:**
- Read the test file to understand what is expected
- Read the service interface from `src/services/interfaces.ts`
- Read the domain models from `src/models/`
- Write the minimal implementation that makes all tests pass
- Run `mise run test:file -- src/services/<name>.test.ts` after each significant change
- Do NOT modify the test file
- Do NOT add features, optimizations, or error handling beyond what the tests require
- Do NOT read the spec document — the tests ARE the spec for this phase
- Export the implementation from `src/services/index.ts`

## Phase 3: Review (Human)

The human reviews both the test file and the implementation:
- Do the tests faithfully represent the spec?
- Is the implementation minimal and correct?
- Are there any spec scenarios that were missed?
- Does `mise run check` pass?

After review, the human commits and moves to the next service.

## Anti-Patterns

### Do not let one agent do both phases
The single most important rule. A single agent writing tests and implementation
in the same context produces tests that verify its own broken code. This defeats
the entire purpose of TDD.

### Do not add verbose TDD procedural instructions to prompts
Research (TDAD, arXiv 2603.17973) found that verbose TDD instructions WITHOUT
contextual information increased regressions by 60%. Give agents the spec
section and the interface — not a lecture on TDD methodology.

### Do not run the full test suite during implementation
Run only the target service's test file during GREEN phase. Full suite output
wastes context tokens. Run `mise run check` only at the end to verify nothing
broke.

### Do not skip the RED confirmation
The test-writer MUST run the tests and confirm they fail before handing off.
If tests pass without implementation, something is wrong (likely testing the
wrong thing).

### Do not refactor during GREEN
Write the simplest code that passes. Refactoring is a separate concern — either
as a third phase or during human review. Mixing implementation and refactoring
in the same pass increases the chance of introducing bugs.

## Mapping to Implementation Order

| # | Service | Spec Section | Dependencies to Mock |
|---|---------|-------------|---------------------|
| 1 | LanguageDetectionService | 3.2, 3.3 | None |
| 2 | TranslationCache | 3.6 | None (mock durable storage) |
| 3 | ReadingPositionService | 3.8 | None |
| 4 | SettingsService | 3.9 | None |
| 5 | TranslationService | 3.4 | AI API |
| 6 | ExplanationService | 3.5 | AI API |
| 7 | EpubAdapter | 3.1.1–3.1.4 | None (use fixture EPUB files) |
| 8 | BookImportService | 3.1 | FormatAdapters, LanguageDetectionService |
| 9 | TranslationPrefetcher | 3.7 | TranslationService, TranslationCache, SettingsService |
| 10 | Integration: Overlay | 3.10 | TranslationService (mock AI) |
| 11 | Integration: Explanation | 3.11 | ExplanationService (mock AI) |

Services 1–4 have no inter-service dependencies and can be implemented in
parallel by separate agents if desired.

## Subagent Configuration

The test-writer and implementer agents are defined in:
- `.claude/agents/tdd-test-writer.md`
- `.claude/agents/tdd-implementer.md`

Each has restricted tool access and explicit constraints matching the rules
above. See those files for the full agent definitions.
