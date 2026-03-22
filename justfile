# AI Reading Companion — task runner

# Run all unit tests
test:
    pnpm exec vitest run

# Run tests in watch mode
test-watch:
    pnpm exec vitest

# Run a single test file
test-file file:
    pnpm exec vitest run {{file}}

# TypeScript type checking
typecheck:
    pnpm exec tsc --build

# Typecheck + run all tests
lint:
    pnpm exec tsc --build && pnpm exec vitest run

# Start development server
dev:
    pnpm exec vite

# Production build
build:
    pnpm exec tsc --build && pnpm exec vite build
