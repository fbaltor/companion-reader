# AI Reading Companion — task runner

# Run all unit tests
test:
    npx vitest run

# Run tests in watch mode
test-watch:
    npx vitest

# Run a single test file
test-file file:
    npx vitest run {{file}}

# TypeScript type checking
typecheck:
    npx tsc --build

# Typecheck + run all tests
lint:
    npx tsc --build && npx vitest run

# Start development server
dev:
    npx vite

# Production build
build:
    npx tsc --build && npx vite build
