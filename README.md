# AI Reading Companion

A reading app where AI is a native part of the experience — not bolted on.
Select any word or passage for a context-aware explanation, or toggle a
translation overlay that shows inline translations without leaving the page.

Built for intermediate-to-advanced language learners reading books in their
target language.

## Core Features

- **File import** — EPUB files parsed into a canonical `Book → Chapter → ContentBlock` model
- **Select-to-explain** — context-aware AI explanations in a floating card (adapts by selection length)
- **Translation overlay** — toggle to dim original text and show inline translations per paragraph
- **Language config** — auto-detect book language, separate explanation and translation target languages
- **Reading experience** — paginated + scroll modes, warm/dark themes, customizable typography

## Tech Stack

TypeScript, React 19, Vite 6, Vitest, Tailwind CSS v4, Dexie (IndexedDB),
JSZip (EPUB parsing), franc (language detection), Vercel AI SDK with
`@ai-sdk/anthropic`.

## Getting Started

Requires [mise](https://mise.jdx.dev/) for tool management.

```bash
mise install          # install Node.js 22 + pnpm 10
pnpm install          # install dependencies
mise run dev          # start dev server
```

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

## Project Structure

```
src/
  models/       # Domain types, error types (bottom layer)
  services/     # Service interfaces and implementations
  ui/           # React components and hooks (top layer)
docs/
  project-context.md        # Problem, user profile, features, UX decisions
  architecture-and-tests.md # Domain models, service interfaces, 60+ behavioral test specs
  tdd-workflow.md            # Agent-driven TDD workflow (test-writer + implementer subagents)
```

## Architecture

All file formats convert to a single canonical model (`Book → Chapter → ContentBlock`)
via format adapters. Services are stateless except for cache, settings, and
reading position. AI provider is abstracted behind `TranslationService` and
`ExplanationService` interfaces.

See [docs/architecture-and-tests.md](docs/architecture-and-tests.md) for the
full specification.

## Development Workflow

This project uses agent-driven TDD with context-isolated subagents. Each
service is implemented in two phases:

1. **RED** — test-writer agent translates behavioral specs into failing Vitest tests
2. **GREEN** — implementer agent (separate context) writes minimal code to pass

See [docs/tdd-workflow.md](docs/tdd-workflow.md) for details.

## Contributing

A pre-commit hook runs `mise run check` (typecheck + tests) on every commit.
Set it up with:

```bash
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```
