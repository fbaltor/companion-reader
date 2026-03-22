# AI Reading Companion — Project Context & Requirements

## 1. Problem Statement

Reading books in a foreign language is one of the most effective ways to learn that language, but the experience is full of friction. You encounter an unfamiliar word, open a dictionary app, lose your place. You struggle with a sentence, copy it into a translator, context-switch, paste, read the result, switch back. You want to understand not just *what* a phrase means but *why* it means that — the cultural context, the grammatical structure, the connotation — and no dictionary gives you that.

Existing tools fall into two camps, and neither solves the problem well:

**Translation tools** (Immersive Translate, BookTranslator, bilingual_book_maker, DeepL) batch-translate entire books into a new language. They produce a finished artifact — a translated EPUB or a side-by-side bilingual book. This is useful for consuming content, but terrible for *learning*. You don't engage with the original text. You don't struggle, look up, understand, and move on. The learning loop is broken.

**Reading apps with AI bolted on** (Readwise Reader with Ghostreader, Linga, Viwoods AiPaper Reader) offer a reading environment where you can select text and get definitions, translations, or summaries. But the AI features are secondary — they live in sidebars, note panels, or popup menus that break your reading flow. The reading experience and the AI experience are two separate things duct-taped together.

**What's missing** is a reading app where AI is a native, seamless part of the reading experience itself. Where you can:

1. Select any word or passage and get an intelligent, context-aware explanation — not a dictionary definition, but an AI that knows the surrounding paragraph and explains the meaning, grammar, and nuance in your preferred language.
2. Toggle a translation overlay that dims the original text and shows translations inline — not in a sidebar, not as a separate document, but woven into the page — so you can glance at the translation when you need it and read the original when you don't.
3. Do both of these without ever leaving the page, without context-switching, without losing your place.

This project builds that app.

---

## 2. Target User

**Primary persona:** An intermediate-to-advanced language learner who reads books in their target language. They know enough vocabulary to follow a narrative but regularly encounter words, idioms, or complex sentences they don't fully understand. They want to read real books — novels, essays, nonfiction — not textbook exercises.

**Key behaviors:**
- Reads for 30–90 minutes at a time on a tablet or laptop
- Encounters 5–20 unknown words/phrases per chapter
- Wants explanations, not just translations — "what does this mean in this context?" not just "what is the dictionary definition?"
- Occasionally wants to see the full translation of a passage to confirm comprehension
- Values reading flow above all — any interruption that breaks immersion is a failure

**Secondary personas:**
- An academic reading papers in a non-native language who needs technical term explanations
- A casual reader who occasionally encounters foreign-language quotes or passages in otherwise-English books

The primary persona drives all design decisions. When in doubt, optimize for the language learner reading a full book.

---

## 3. Core Features (Prioritized)

### P0 — Must have for first usable version

**3.1 File import and parsing**
- User uploads a file (EPUB initially, PDF as a second format)
- The app parses it into an internal canonical format (see architecture doc: `Book → Chapter → ContentBlock`)
- The original file format is an implementation detail hidden behind a `FormatAdapter` interface
- The app displays chapter navigation and a table of contents

**3.2 Reading experience**
- Clean, distraction-free reading view
- Two reading modes: paginated (swipe/tap to turn pages) and continuous scroll
- Customizable typography: font family, font size, line height
- Two themes: warm (cream background, dark text) and dark (charcoal background, warm light text)
- Reading position is saved and restored when the user returns to a book

**3.3 Select-to-explain**
- User selects any text (word, phrase, sentence, or passage)
- A floating card appears near the selection
- The card shows an AI-generated explanation in the user's chosen language
- The explanation is context-aware — the AI receives the full surrounding paragraph, not just the selected text
- The prompt adapts: a single word gets a definition + usage explanation; a sentence gets a translation + grammatical breakdown; a passage gets an interpretation
- The card can be dismissed by tapping outside or swiping away

**3.4 Translation overlay**
- A toggle (in the toolbar) enables/disables the translation overlay
- When enabled: the original text dims (reduced opacity), and a translation appears visually associated with each paragraph — the exact presentation is a view concern, but the data layer provides translated text per `ContentBlock`
- Translations are fetched intelligently: batch the visible screen, prefetch the next screen after a dwell period (see architecture doc: `TranslationPrefetcher`)
- Translations are cached in memory and can be persisted to durable storage on demand
- The user can change the target language at any time; cached translations for other languages are preserved

**3.5 Language configuration**
- The app auto-detects the book's language on import
- The user can override the detected language
- The user chooses their explanation language (the language AI explanations are written in)
- The user chooses their translation language (the target language for the overlay)
- These can be different — e.g., reading a French book, explanations in English, overlay translations in Portuguese

### P1 — Important but can come after initial version

- PDF support via a second `FormatAdapter`
- Bookmarks and highlights
- Vocabulary list (words the user has looked up, exportable)
- Adjustable translation overlay opacity/style
- Ask questions about the document (chat with the book)

### P2 — Nice to have

- Text-to-speech for the original text
- Spaced repetition integration for looked-up vocabulary
- Multiple books / library management
- Sharing highlighted passages with translations

---

## 4. UX Decisions (Already Made)

These decisions were made through discussion with the user and should be treated as requirements, not suggestions.

| Decision | Choice | Rationale |
|---|---|---|
| Translation overlay style | Toggleable overlay that dims the original text | Keeps reading view clean by default; translation takes visual priority when activated without cluttering the layout |
| Explanation presentation | Floating card anchored near the text selection | Stays in the reading flow; no sidebar or panel that shifts content |
| Visual tone | Warm & bookish (cream backgrounds, serif fonts) | This is a reading app, not a tech tool; it should feel like a beautifully designed book |
| Reading modes | Both paginated and scroll available | Different users prefer different modes; both should be first-class |
| Language detection | Auto-detect with manual override | Reduces setup friction while allowing correction |
| Explanation language | User-selectable from a list | Not everyone wants English; a Portuguese speaker learning French may want explanations in Portuguese |
| Translation fetching | Batch visible screen + prefetch next screen after 2s dwell | Balances cost and UX; avoids translating content the user never reads |
| Translation caching | In-memory with persist-on-demand | Fast reads, no data loss on intentional saves, no unnecessary storage writes |

---

## 5. Architecture Summary

The full architecture is defined in the companion document: **`architecture-and-tests.md`**. Here is a brief orientation.

### Data flow

```
User uploads file
  → BookImportService selects FormatAdapter by format
    → FormatAdapter parses file into canonical Book model
      → LanguageDetectionService detects book language
        → Book is ready for reading

User reads and scrolls
  → View reports visible ContentBlock IDs to TranslationPrefetcher
    → Prefetcher checks TranslationCache
      → For uncached blocks: calls TranslationService (batched)
        → Results are stored in TranslationCache
          → View renders translations from cache

User selects text
  → View dispatches explain action with selected text + context block
    → ExplanationService calls AI API with text + context + languages
      → Explanation is returned to view for display in floating card
```

### Key design principles

1. **Format agnosticism.** The system has a single canonical book model (`Book → Chapter → ContentBlock`). File format parsing is isolated in `FormatAdapter` implementations. Adding a new format means writing one new adapter. Nothing else changes.

2. **Separation of data and view.** The architecture document defines domain models, service interfaces, and behavioral tests with zero reference to any UI framework, rendering technology, or platform. The view is a consumer of these services. It can be React, SwiftUI, Flutter, or a terminal app — the data layer doesn't care.

3. **AI provider abstraction.** `TranslationService` and `ExplanationService` define what goes in and what comes out. The implementation decides which AI API to call. Swapping providers changes one module.

4. **Explicit error handling.** All services return `Result<T, Error>` types. No thrown exceptions. Error codes are typed and documented. The view layer can handle each error case deliberately.

5. **Stateless services, stateful cache.** Translation and explanation services are pure functions (input → output). State lives in the `TranslationCache`, `ReadingPositionService`, and `SettingsService` — each with clear persistence semantics.

### Module dependency graph

```
BookImportService
  ├── FormatAdapter (EPUB)
  ├── FormatAdapter (PDF)
  └── LanguageDetectionService

TranslationPrefetcher
  ├── TranslationService
  ├── TranslationCache
  └── SettingsService

ExplanationService (standalone)
ReadingPositionService (standalone)
SettingsService (standalone)
TranslationCache (standalone, two-tier)
```

No circular dependencies. View depends on all; none depend on view.

---

## 6. Behavioral Test Coverage

The architecture document contains 60+ behavioral test specifications organized into 11 sections:

| Section | What it covers | Approx. test count |
|---|---|---|
| 3.1 Book Import | Format routing, structure parsing, error handling, TOC | 14 |
| 3.2 Language Detection | Script-based detection, confidence, edge cases | 7 |
| 3.3 Language Override | Override, reset, interaction with detection | 4 |
| 3.4 Translation Service | Single block, batch, errors, same-language, API failures | 11 |
| 3.5 Explanation Service | Context-aware explain, disambiguation, language, errors | 7 |
| 3.6 Translation Cache | Memory ops, persistence, overwrite, invalidation | 13 |
| 3.7 Translation Prefetcher | Viewport, dwell, cancellation, status lifecycle | 10 |
| 3.8 Reading Position | Save, load, overwrite, clear, independence | 5 |
| 3.9 User Settings | Defaults, partial update, subscriptions, reset, persistence | 7 |
| 3.10 Integration: Overlay | Enable/disable coordination, cache reuse, language change | 4 |
| 3.11 Integration: Explanation | End-to-end selection flow, language precedence | 4 |

Tests are written as **GIVEN / WHEN / THEN** scenarios with no framework coupling. An implementing agent should:

1. Choose a language and test framework
2. Implement the domain models as plain data structures
3. Implement each service interface
4. Translate each behavioral test into an executable test case
5. Use mocks/stubs for AI API calls (TranslationService and ExplanationService implementations that call a real API should be tested separately as integration tests)

Additionally, Section 4 of the architecture document defines **6 architectural invariants** that should be enforced either through tests, code review, or architectural fitness functions.

---

## 7. Technical Constraints & Considerations

### What is NOT decided (implementation agent chooses)

- **Programming language and framework.** The architecture is language-agnostic. TypeScript, Kotlin, Swift, Dart, Rust — any is valid. Choose based on the target platform.
- **UI framework.** React, SwiftUI, Compose, Flutter, plain HTML/JS — the data layer is decoupled.
- **AI provider.** The architecture abstracts this behind service interfaces. The implementation could use Anthropic Claude, OpenAI, local models, or any other provider.
- **Storage technology.** The `TranslationCache` and `SettingsService` need durable storage. This could be localStorage, IndexedDB, SQLite, a file system, or a remote database.
- **EPUB/PDF parsing library.** The `FormatAdapter` interface is defined; the implementing agent picks the library (epub.js, JSZip, pdf.js, Apache PDFBox, etc.).

### What IS decided (treat as constraints)

- The canonical `Book` model is the single source of truth for content. No service outside a `FormatAdapter` may reference format-specific structures.
- Services are stateless (except cache, position, settings). No service holds request state between calls.
- All service methods return `Result` types, not thrown exceptions.
- The translation prefetcher is the only component that decides *when* to translate. The view tells it what's visible; it decides what to fetch.
- The view layer never calls `TranslationService` or `ExplanationService` directly.

### Performance considerations

- EPUB files can be 1–50 MB. Parsing should be lazy where possible — don't parse all chapters upfront if the user only reads chapter 1.
- A chapter may contain 50–200 content blocks. Batch translation should respect API rate limits and token limits.
- Translation cache may grow to thousands of entries for a long book in multiple languages. The in-memory structure should support O(1) lookup by (blockId, targetLanguage).
- Prefetcher cancellation must actually abort in-flight HTTP requests, not just ignore their results. This prevents wasted API costs.

### Prompt engineering notes (for TranslationService and ExplanationService implementers)

**Translation prompts** should:
- Specify source and target languages explicitly
- Instruct the model to translate naturally, not literally
- For batch translation, clearly delineate block boundaries in the prompt so the model returns one translation per block in order
- Include a system instruction that this is book content, to preserve literary tone

**Explanation prompts** should:
- Include both the selected text AND the surrounding paragraph as context
- Adapt based on selection length:
  - Single word (< 3 words): provide definition, part of speech, usage in this context, and any connotations
  - Phrase/sentence (3–30 words): provide translation, grammatical breakdown, and why the author might have used this phrasing
  - Long passage (30+ words): provide a summary/interpretation and key vocabulary
- Specify the explanation language
- Instruct the model to be concise — this appears in a floating card, not a full page

---

## 8. Glossary

| Term | Definition |
|---|---|
| **ContentBlock** | The atomic unit of text content. Usually a paragraph, but can also be a heading, quote, code block, or image caption. This is the granularity at which translation operates. |
| **FormatAdapter** | A module that converts a specific file format (EPUB, PDF) into the canonical Book model. The only code that knows about file format internals. |
| **Translation overlay** | A visual mode where the original text is dimmed and translations are shown inline. Toggled on/off by the user. |
| **Floating explanation card** | A UI element that appears near a text selection showing an AI-generated explanation. Anchored to the selection position, not a fixed sidebar. |
| **Prefetcher** | The component that decides when to request translations based on what the user is viewing. Implements batch + dwell-based prefetch strategy. |
| **Dwell** | The amount of time a user stays on the current viewport without scrolling. Used as a signal that they're reading (not skimming) to trigger prefetching of the next screen. |
| **Canonical Book model** | The internal representation of a book (`Book → Chapter → ContentBlock`). Format-agnostic. The single source of truth for all services. |
| **Result type** | A return type that is either a success value or a typed error. Used instead of thrown exceptions for explicit error handling. |

---

## 9. File Manifest

| File | Purpose |
|---|---|
| `project-context.md` (this file) | Problem definition, user profile, feature requirements, UX decisions, technical constraints, onboarding guide for new agents |
| `architecture-and-tests.md` | Domain models, service interfaces, 60+ behavioral test specs, architectural invariants, dependency graph |

---

## 10. Getting Started (For Implementing Agents)

1. **Read this document first** to understand the problem, the user, and the constraints.
2. **Read `architecture-and-tests.md`** for the full technical specification.
3. **Choose your stack** (language, framework, test framework, storage, AI provider).
4. **Implement domain models** as plain data structures. They should be trivially serializable.
5. **Implement services** starting with the ones that have no dependencies:
   - `LanguageDetectionService` (standalone, no deps)
   - `TranslationCache` (standalone)
   - `ReadingPositionService` (standalone)
   - `SettingsService` (standalone)
   - Then `TranslationService` and `ExplanationService` (depend on AI provider)
   - Then `FormatAdapter` implementations (depend on parsing libraries)
   - Then `BookImportService` (depends on adapters + language detection)
   - Then `TranslationPrefetcher` (depends on translation service, cache, settings)
6. **Write tests** by translating each GIVEN/WHEN/THEN scenario from the architecture doc into your test framework. Use mocks for AI API calls.
7. **Build the view layer last.** The data layer should be fully tested before any UI work begins.
