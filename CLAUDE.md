# AI Reading Companion

@docs/project-context.md
@docs/architecture-and-tests.md
@docs/tdd-workflow.md

## Setup

Managed by mise. Run `mise install` to get the correct Node.js and pnpm versions.

## Commands

```
mise run dev             # start dev server (Vite)
mise run build           # typecheck + production build
mise run test            # run all unit tests (Vitest)
mise run test:watch      # run tests in watch mode
mise run test:file -- <path>  # run single test file
mise run typecheck       # tsc --build
mise run check           # typecheck + tests (pre-commit gate)
```

## Tech Stack

TypeScript, React 19, Vite 6, Vitest, Tailwind CSS v4, Dexie (IndexedDB),
JSZip (EPUB parsing), franc (language detection), Vercel AI SDK (`ai`) with
`@ai-sdk/anthropic` as default provider.

## Project Structure

```
src/
  models/       # Domain types, error types (bottom layer)
  services/     # Service interfaces and implementations
  ui/           # React components and hooks (top layer)
```

## Dependency Layers

```
models/ → services/ → ui/
```

No backward imports. models/ never imports from services/ or ui/.
services/ never imports from ui/.

## Architecture

Canonical model: `Book → Chapter → ContentBlock`. All file formats convert to
this model via FormatAdapters. Services are stateless except TranslationCache,
ReadingPositionService, and SettingsService.

Module graph:

```
BookImportService ← FormatAdapter(EPUB), LanguageDetectionService
TranslationPrefetcher ← TranslationService, TranslationCache, SettingsService
ExplanationService (standalone)
ReadingPositionService (standalone)
SettingsService (standalone)
TranslationCache (standalone, two-tier: memory + Dexie)
```

## Conventions

- Return `Result<T, E>` from all service methods. Use `ok(value)` and `err(error)` helpers from `src/models/result.ts`.
- Use named exports. Prefer `interface` over `type` for object shapes.
- Test files live next to source: `foo.ts` → `foo.test.ts`.
- Write tests in GIVEN/WHEN/THEN structure using `describe`/`it`/`expect`.
- Mock AI API calls in unit tests.

## Never

- Never throw exceptions in service code. Return Result types.
- Never import from `services/` or `ui/` in `models/`.
- Never import from `ui/` in `services/`.
- Never import format-specific code (EPUB XML, PDF structures) outside a FormatAdapter.
- Never call TranslationService or ExplanationService directly from UI code.
- Never mutate the Book model after import (except `language` and `languageOverridden`).
- Never make real API calls in `mise run test`.
- Never use default exports.

## Implementation Order

Implement services bottom-up following the dependency graph:

1. LanguageDetectionService (standalone)
2. TranslationCache (standalone)
3. ReadingPositionService (standalone)
4. SettingsService (standalone)
5. TranslationService, ExplanationService (AI provider abstraction)
6. EpubAdapter (EPUB parsing)
7. BookImportService (depends on adapters + language detection)
8. TranslationPrefetcher (depends on translation service, cache, settings)
9. UI layer (depends on all services)
