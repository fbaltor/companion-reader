# AI Reading Companion

## Commands

```
npm run dev          # start dev server (Vite)
npm run build        # typecheck + production build
npm run test         # run all unit tests (Vitest)
npm run test:watch   # run tests in watch mode
npm run typecheck    # tsc --build
```

Or via justfile:

```
just dev             # start dev server
just build           # typecheck + production build
just test            # run all unit tests
just test-watch      # tests in watch mode
just typecheck       # type checking only
just lint            # typecheck + tests
just test-file <path> # run single test file
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

- Return `Result<T, E>` from all service methods. Never throw exceptions.
- Use `ok(value)` and `err(error)` helpers from `src/models/result.ts`.
- Use named exports. Never use default exports.
- Prefer `interface` over `type` for object shapes.
- Test files live next to source: `foo.ts` → `foo.test.ts`.
- Write tests in GIVEN/WHEN/THEN structure using `describe`/`it`/`expect`.
- Mock AI API calls in unit tests. Never make real API calls in `npm run test`.

## Boundaries

Never import from `services/` or `ui/` in `models/`.
Never import from `ui/` in `services/`.
Never import format-specific code (EPUB XML, PDF structures) outside a FormatAdapter.
Never call TranslationService or ExplanationService directly from UI code.
  Use TranslationPrefetcher for translations; dispatch actions for explanations.
Never throw exceptions in service code. Return Result types.
Never mutate the Book model after import (except `language` and `languageOverridden`).
TranslationPrefetcher is the sole decider of when to translate.

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

## Reference

Full requirements and UX decisions: `project-context.md`
Domain models, service interfaces, 60+ behavioral test specs: `architecture-and-tests.md`
