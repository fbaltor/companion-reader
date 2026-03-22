# AI Reading Companion — Data Architecture & Behavioral Test Specification

## 1. Domain Models

All models are plain data structures. No framework dependency. No rendering concern.

### 1.1 Book (canonical internal format)

Every external format (EPUB, PDF, MOBI, etc.) is converted into this single canonical representation by a format-specific adapter. The rest of the system only knows about this model.

```
Book {
  id: string                    // generated UUID on import
  title: string
  author: string
  language: LanguageCode        // detected or user-overridden
  languageConfidence: number    // 0.0–1.0, from detection
  languageOverridden: boolean   // true if user manually set it
  coverImage: BinaryData | null
  tableOfContents: TocEntry[]
  chapters: Chapter[]
  metadata: Record<string, string>  // arbitrary key-value (publisher, date, etc.)
  importedAt: Timestamp
  sourceFormat: string          // 'epub', 'pdf', etc. — informational only
  sourceFileName: string
}

TocEntry {
  title: string
  chapterId: string
  depth: number                 // nesting level (0 = top level)
}

Chapter {
  id: string
  bookId: string
  title: string
  index: number                 // 0-based position in reading order
  blocks: ContentBlock[]
}
```

### 1.2 ContentBlock

The fundamental unit of content. A chapter is a sequence of content blocks. This is the granularity at which translation operates.

```
ContentBlock {
  id: string                    // unique within the book
  chapterId: string
  index: number                 // position within chapter
  type: 'paragraph' | 'heading' | 'quote' | 'code' | 'image' | 'list'
  text: string                  // plain text content (stripped of formatting)
  richContent: string | null    // original marked-up content if available (HTML, etc.)
  language: LanguageCode | null // block-level override if mixed-language book
}
```

Design notes:
- `text` is always populated for any block that contains words. It is what gets sent to the AI for translation/explanation.
- `richContent` preserves formatting for the view layer. The data layer never interprets it.
- `image` blocks have `text` as alt-text/caption (may be empty) and `richContent` as a reference to the image data.
- Translation and explanation services operate on `text`, never on `richContent`.

### 1.3 Translation

```
Translation {
  id: string
  blockId: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  sourceText: string            // snapshot of what was translated
  translatedText: string
  createdAt: Timestamp
}
```

### 1.4 Explanation

```
Explanation {
  id: string
  selectedText: string          // exact text the user selected
  contextBlockId: string        // which block the selection came from
  contextText: string           // full text of the surrounding block (for AI context)
  sourceLanguage: LanguageCode
  explanationLanguage: LanguageCode
  explanation: string           // the AI-generated explanation
  createdAt: Timestamp
}
```

### 1.5 UserSettings

```
UserSettings {
  explanationLanguage: LanguageCode     // language for AI explanations
  translationLanguage: LanguageCode     // target language for inline translations
  readingMode: 'paginated' | 'scroll'
  theme: 'warm' | 'dark'
  fontSize: number
  fontFamily: string
  translationOverlayEnabled: boolean
}
```

### 1.6 ReadingPosition

```
ReadingPosition {
  bookId: string
  chapterId: string
  blockId: string               // last visible block
  scrollOffset: number          // within-block offset (pixels or fraction)
  updatedAt: Timestamp
}
```

### 1.7 LanguageCode

A string type alias. ISO 639-1 two-letter codes: `"en"`, `"es"`, `"fr"`, `"de"`, `"it"`, `"pt"`, `"zh"`, `"ja"`, `"ko"`, `"ru"`, `"ar"`, `"hi"`, `"nl"`, `"sv"`, `"pl"`, `"tr"`.

---

## 2. Service Interfaces

Each service is defined by its contract (inputs, outputs, side effects). Implementations are separate concerns.

### 2.1 BookImportService

Responsible for converting an external file into the canonical `Book` model. Delegates to format-specific adapters.

```
BookImportService {
  import(file: FileInput) -> Result<Book, ImportError>
  getSupportedFormats() -> string[]
}

FileInput {
  name: string
  data: BinaryData
  mimeType: string | null
}

ImportError {
  code: 'UNSUPPORTED_FORMAT' | 'CORRUPT_FILE' | 'EMPTY_CONTENT' | 'PARSE_ERROR'
  message: string
  details: string | null
}
```

This service does NOT know how to parse any format itself. It selects the correct adapter.

### 2.2 FormatAdapter (one per supported format)

```
FormatAdapter {
  canHandle(file: FileInput) -> boolean
  parse(file: FileInput) -> Result<Book, ImportError>
}
```

Examples: `EpubAdapter`, `PdfAdapter`. Each is an independent module that converts a specific format into the canonical `Book` model. The rest of the system never interacts with adapters directly.

### 2.3 LanguageDetectionService

```
LanguageDetectionService {
  detect(text: string) -> LanguageDetectionResult
}

LanguageDetectionResult {
  language: LanguageCode
  confidence: number            // 0.0–1.0
  alternatives: { language: LanguageCode, confidence: number }[]
}
```

### 2.4 TranslationService

Translates content blocks. Stateless — caching is a separate concern handled by the cache layer.

```
TranslationService {
  translateBlock(block: ContentBlock, targetLang: LanguageCode, sourceLang: LanguageCode) -> Result<Translation, TranslationError>
  translateBatch(blocks: ContentBlock[], targetLang: LanguageCode, sourceLang: LanguageCode) -> Result<Translation[], TranslationError>
}

TranslationError {
  code: 'API_ERROR' | 'RATE_LIMITED' | 'UNSUPPORTED_LANGUAGE' | 'EMPTY_INPUT' | 'CANCELLED'
  message: string
  retryable: boolean
}
```

### 2.5 ExplanationService

```
ExplanationService {
  explain(request: ExplanationRequest) -> Result<Explanation, ExplanationError>
}

ExplanationRequest {
  selectedText: string
  contextBlock: ContentBlock
  sourceLanguage: LanguageCode
  explanationLanguage: LanguageCode
}

ExplanationError {
  code: 'API_ERROR' | 'RATE_LIMITED' | 'EMPTY_INPUT' | 'SELECTION_TOO_LONG'
  message: string
  retryable: boolean
}
```

### 2.6 TranslationCache

```
TranslationCache {
  get(blockId: string, targetLang: LanguageCode) -> Translation | null
  put(translation: Translation) -> void
  has(blockId: string, targetLang: LanguageCode) -> boolean
  invalidate(blockId: string) -> void       // remove all translations for a block
  invalidateAll() -> void
  persist() -> void                          // flush memory to durable storage
  restore() -> void                          // load from durable storage into memory
  size() -> number
}
```

Two-tier: in-memory map for hot reads, durable storage for persistence. `persist()` is called on demand (not after every write).

### 2.7 TranslationPrefetcher

Orchestrates when and what to translate based on what the user is currently viewing. This is the "smart" layer between the view and the TranslationService.

```
TranslationPrefetcher {
  onViewportChanged(visibleBlockIds: string[], nextBlockIds: string[]) -> void
  onDwell(durationMs: number) -> void       // user stayed on current viewport
  cancelAll() -> void
  getStatus(blockId: string) -> 'idle' | 'queued' | 'loading' | 'ready' | 'error'
}
```

Configuration:
```
PrefetcherConfig {
  batchSize: number             // max blocks per API call (default: 6)
  dwellThresholdMs: number      // time before prefetching next screen (default: 2000)
  maxConcurrentRequests: number // (default: 2)
  cancelStaleRequests: boolean  // abort requests for blocks no longer near viewport (default: true)
}
```

### 2.8 ReadingPositionService

```
ReadingPositionService {
  save(position: ReadingPosition) -> void
  load(bookId: string) -> ReadingPosition | null
  clear(bookId: string) -> void
}
```

### 2.9 SettingsService

```
SettingsService {
  get() -> UserSettings
  update(partial: Partial<UserSettings>) -> UserSettings
  reset() -> UserSettings       // restore defaults
  onChange(callback: (settings: UserSettings) -> void) -> Unsubscribe
}
```

---

## 3. Behavioral Test Specifications

These tests define the expected behavior of the system. They are deliberately framework-agnostic — no mention of React, DOM, HTTP, or specific test libraries. Each test describes a **scenario**, **preconditions**, **action**, and **expected outcome**. An implementing agent should translate these into executable tests in whatever language/framework is chosen.

### 3.1 Book Import

#### 3.1.1 Format Routing

```
TEST: Import routes EPUB file to EPUB adapter
  GIVEN a FileInput with name "book.epub" and valid EPUB binary data
  WHEN BookImportService.import(file) is called
  THEN the EpubAdapter.parse() is invoked
  AND the PdfAdapter.parse() is NOT invoked
  AND the result is a Book with sourceFormat = "epub"

TEST: Import routes PDF file to PDF adapter
  GIVEN a FileInput with name "report.pdf" and valid PDF binary data
  WHEN BookImportService.import(file) is called
  THEN the PdfAdapter.parse() is invoked
  AND the result is a Book with sourceFormat = "pdf"

TEST: Import rejects unsupported format
  GIVEN a FileInput with name "document.docx"
  WHEN BookImportService.import(file) is called
  THEN the result is an ImportError with code = "UNSUPPORTED_FORMAT"
  AND no adapter is invoked

TEST: Import detects format from content when extension is ambiguous
  GIVEN a FileInput with name "book.zip" but the binary data is a valid EPUB (ZIP with META-INF/container.xml)
  WHEN BookImportService.import(file) is called
  THEN the system attempts content-based detection
  AND routes to the EpubAdapter
```

#### 3.1.2 Book Structure

```
TEST: Imported book has required fields populated
  GIVEN a valid EPUB file with title "Don Quixote", author "Cervantes", and 5 chapters
  WHEN successfully imported
  THEN book.title = "Don Quixote"
  AND book.author = "Cervantes"
  AND book.chapters has length 5
  AND book.id is a non-empty unique string
  AND book.importedAt is a valid timestamp
  AND book.sourceFileName matches the input file name

TEST: Chapters are ordered by spine/reading order
  GIVEN a valid EPUB with chapters ordered: "Prologue", "Chapter 1", "Chapter 2"
  WHEN successfully imported
  THEN book.chapters[0].title = "Prologue" AND .index = 0
  AND book.chapters[1].title = "Chapter 1" AND .index = 1
  AND book.chapters[2].title = "Chapter 2" AND .index = 2

TEST: Chapter content is split into content blocks
  GIVEN an EPUB chapter containing 3 paragraphs and 1 heading
  WHEN successfully imported
  THEN the chapter has 4 content blocks
  AND blocks are ordered by their position in the source
  AND each block has a unique id, correct chapterId, and sequential index

TEST: Content blocks preserve plain text and rich content separately
  GIVEN an EPUB paragraph with HTML: "<p>He walked <em>slowly</em> home.</p>"
  WHEN parsed into a ContentBlock
  THEN block.text = "He walked slowly home."
  AND block.richContent = "<p>He walked <em>slowly</em> home.</p>"

TEST: Image blocks capture alt text
  GIVEN an EPUB containing an <img alt="A windmill"> element
  WHEN parsed into a ContentBlock
  THEN block.type = "image"
  AND block.text = "A windmill"

TEST: Empty chapters are preserved but have zero content blocks
  GIVEN an EPUB with a chapter that contains no text content (only whitespace or empty tags)
  WHEN successfully imported
  THEN the chapter exists in book.chapters
  AND chapter.blocks has length 0
```

#### 3.1.3 Error Handling

```
TEST: Corrupt file produces CORRUPT_FILE error
  GIVEN a FileInput with name "book.epub" but random/garbled binary data
  WHEN BookImportService.import(file) is called
  THEN the result is an ImportError with code = "CORRUPT_FILE"

TEST: Empty file produces EMPTY_CONTENT error
  GIVEN a FileInput with name "empty.epub" and zero-length data
  WHEN BookImportService.import(file) is called
  THEN the result is an ImportError with code = "EMPTY_CONTENT"

TEST: EPUB with missing spine produces PARSE_ERROR
  GIVEN an EPUB file that is a valid ZIP but has a malformed OPF with no <spine> element
  WHEN BookImportService.import(file) is called
  THEN the result is an ImportError with code = "PARSE_ERROR"
  AND the error message indicates what is missing

TEST: Import errors include the original file name in details
  GIVEN any file that fails to import
  WHEN the error is returned
  THEN error.details contains the source file name
```

#### 3.1.4 Table of Contents

```
TEST: Table of contents is extracted from EPUB NCX/NAV
  GIVEN an EPUB with a table of contents containing 3 entries with nesting
  WHEN successfully imported
  THEN book.tableOfContents has 3+ entries
  AND each entry has a title, chapterId referencing a valid chapter, and correct depth

TEST: Flat TOC has all entries at depth 0
  GIVEN an EPUB with a flat (non-nested) table of contents
  WHEN successfully imported
  THEN all TocEntry items have depth = 0

TEST: Missing TOC results in auto-generated TOC from chapter titles
  GIVEN an EPUB with no NCX or NAV document
  WHEN successfully imported
  THEN book.tableOfContents is generated from chapter titles
  AND each entry references the correct chapter
```

### 3.2 Language Detection

```
TEST: Detects Spanish from representative text
  GIVEN a text sample: "El ingenioso hidalgo don Quijote de la Mancha es una novela escrita por el autor Miguel de Cervantes"
  WHEN LanguageDetectionService.detect(text) is called
  THEN result.language = "es"
  AND result.confidence > 0.7

TEST: Detects Japanese from character set
  GIVEN a text sample containing primarily hiragana/katakana/kanji characters
  WHEN LanguageDetectionService.detect(text) is called
  THEN result.language = "ja"

TEST: Detects Chinese from character set
  GIVEN a text sample containing primarily CJK unified ideographs without kana
  WHEN LanguageDetectionService.detect(text) is called
  THEN result.language = "zh"

TEST: Returns alternatives ranked by confidence
  GIVEN a text sample that is ambiguous between Portuguese and Spanish
  WHEN LanguageDetectionService.detect(text) is called
  THEN result.alternatives contains both "pt" and "es"
  AND alternatives are sorted by descending confidence

TEST: Short text produces low confidence
  GIVEN a text sample of fewer than 10 words
  WHEN LanguageDetectionService.detect(text) is called
  THEN result.confidence < 0.5

TEST: Empty text returns a default with zero confidence
  GIVEN an empty string
  WHEN LanguageDetectionService.detect("") is called
  THEN result.confidence = 0.0

TEST: Language detection uses first N characters for efficiency
  GIVEN a text of 100,000 characters where the first 500 are French and the rest is English
  WHEN LanguageDetectionService.detect(text) is called
  THEN result.language = "fr"
  AND the service does NOT process all 100,000 characters (performance constraint)
```

### 3.3 Language Override on Book

```
TEST: Book language is set from detection on import
  GIVEN a valid EPUB whose content is in French
  WHEN successfully imported
  THEN book.language = "fr"
  AND book.languageOverridden = false

TEST: User can override detected language
  GIVEN a Book with detected language "fr"
  WHEN the user sets language to "es"
  THEN book.language = "es"
  AND book.languageOverridden = true

TEST: Override does not re-run detection
  GIVEN a Book with languageOverridden = true
  WHEN book content is accessed
  THEN LanguageDetectionService.detect is NOT called again

TEST: Resetting override re-runs detection
  GIVEN a Book with languageOverridden = true and language = "es"
  WHEN the user resets to auto-detect
  THEN LanguageDetectionService.detect is called on the book content
  AND book.language is updated to the detection result
  AND book.languageOverridden = false
```

### 3.4 Translation Service

#### 3.4.1 Single Block Translation

```
TEST: Translates a content block successfully
  GIVEN a ContentBlock with text "La casa es grande" and sourceLang "es"
  WHEN TranslationService.translateBlock(block, "en", "es") is called
  AND the AI API returns a successful response
  THEN the result is a Translation
  AND translation.sourceText = "La casa es grande"
  AND translation.sourceLanguage = "es"
  AND translation.targetLanguage = "en"
  AND translation.translatedText is a non-empty string
  AND translation.blockId = block.id

TEST: Translation of empty text returns EMPTY_INPUT error
  GIVEN a ContentBlock with text = ""
  WHEN TranslationService.translateBlock(block, "en", "es") is called
  THEN the result is a TranslationError with code = "EMPTY_INPUT"
  AND no AI API call is made

TEST: Translation of whitespace-only text returns EMPTY_INPUT error
  GIVEN a ContentBlock with text = "   \n\t  "
  WHEN TranslationService.translateBlock(block, "en", "es") is called
  THEN the result is a TranslationError with code = "EMPTY_INPUT"

TEST: API failure returns API_ERROR with retryable flag
  GIVEN a ContentBlock with valid text
  WHEN TranslationService.translateBlock is called
  AND the AI API returns a 500 server error
  THEN the result is a TranslationError with code = "API_ERROR"
  AND error.retryable = true

TEST: Rate limiting returns RATE_LIMITED with retryable flag
  GIVEN a ContentBlock with valid text
  WHEN TranslationService.translateBlock is called
  AND the AI API returns a 429 rate limit response
  THEN the result is a TranslationError with code = "RATE_LIMITED"
  AND error.retryable = true

TEST: Translating to the same language as source returns the original text
  GIVEN a ContentBlock with text "Hello world" and sourceLang "en"
  WHEN TranslationService.translateBlock(block, "en", "en") is called
  THEN the result is a Translation where translatedText = sourceText
  AND no AI API call is made
```

#### 3.4.2 Batch Translation

```
TEST: Batch translates multiple blocks in a single operation
  GIVEN 4 ContentBlocks with Spanish text
  WHEN TranslationService.translateBatch(blocks, "en", "es") is called
  THEN the result contains exactly 4 Translations
  AND each Translation corresponds to the correct block by blockId
  AND the AI API is called with all 4 texts combined (not 4 separate calls)

TEST: Batch with some empty blocks skips them gracefully
  GIVEN 3 ContentBlocks where the 2nd has empty text
  WHEN TranslationService.translateBatch(blocks, "en", "es") is called
  THEN the result contains 2 Translations (for blocks 1 and 3)
  AND no error is raised for the empty block

TEST: Batch with zero valid blocks returns empty result
  GIVEN 2 ContentBlocks both with empty text
  WHEN TranslationService.translateBatch(blocks, "en", "es") is called
  THEN the result is an empty list
  AND no AI API call is made

TEST: Batch preserves order matching input blocks
  GIVEN blocks [A, B, C] in that order
  WHEN TranslationService.translateBatch is called
  THEN the result translations are [Translation_A, Translation_B, Translation_C] in order

TEST: Partial API failure in batch returns error for entire batch
  GIVEN 3 ContentBlocks
  WHEN TranslationService.translateBatch is called
  AND the AI API fails mid-response
  THEN the result is a TranslationError
  AND no partial translations are returned
```

### 3.5 Explanation Service

```
TEST: Explains selected text in the requested language
  GIVEN selectedText = "hidalgo"
  AND contextBlock with text = "El ingenioso hidalgo don Quijote de la Mancha"
  AND sourceLanguage = "es", explanationLanguage = "en"
  WHEN ExplanationService.explain(request) is called
  THEN the result is an Explanation
  AND explanation.explanation is a non-empty string in English
  AND explanation.selectedText = "hidalgo"
  AND explanation.contextBlockId = contextBlock.id

TEST: Explanation includes context for ambiguous words
  GIVEN selectedText = "banco" (which can mean "bank" or "bench" in Spanish)
  AND contextBlock with text = "Se sentó en el banco del parque" (He sat on the park bench)
  WHEN ExplanationService.explain(request) is called
  THEN the explanation disambiguates based on context
  AND the explanation references the meaning "bench", not "bank"

TEST: Explanation in a non-English language
  GIVEN selectedText = "freedom"
  AND contextBlock with text about political philosophy
  AND explanationLanguage = "es"
  WHEN ExplanationService.explain(request) is called
  THEN the explanation text is in Spanish

TEST: Empty selection returns EMPTY_INPUT error
  GIVEN selectedText = ""
  WHEN ExplanationService.explain(request) is called
  THEN the result is an ExplanationError with code = "EMPTY_INPUT"

TEST: Very long selection returns SELECTION_TOO_LONG error
  GIVEN selectedText with more than 2000 characters
  WHEN ExplanationService.explain(request) is called
  THEN the result is an ExplanationError with code = "SELECTION_TOO_LONG"

TEST: Explanation for a full sentence differs from a single word
  GIVEN two requests: one with selectedText = "Mancha" and one with selectedText = "El ingenioso hidalgo don Quijote de la Mancha"
  AND same contextBlock and languages
  WHEN both are explained
  THEN the single-word explanation focuses on definition and meaning
  AND the full-sentence explanation focuses on interpretation and translation
  (This tests that the prompt adapts to selection length)

TEST: Context is sent to the AI even though only selected text is highlighted
  GIVEN selectedText = "hidalgo"
  AND contextBlock with a full paragraph of text
  WHEN the AI API is called
  THEN the request payload includes both the selected text AND the surrounding context
  AND the context is clearly delineated from the selection in the prompt
```

### 3.6 Translation Cache

#### 3.6.1 In-Memory Behavior

```
TEST: Cache miss returns null
  GIVEN an empty cache
  WHEN cache.get("block-1", "en") is called
  THEN the result is null

TEST: Cache hit returns stored translation
  GIVEN a cache with a Translation for blockId="block-1", targetLang="en"
  WHEN cache.get("block-1", "en") is called
  THEN the result is the stored Translation

TEST: Cache distinguishes by target language
  GIVEN translations cached for ("block-1", "en") and ("block-1", "fr")
  WHEN cache.get("block-1", "en") is called
  THEN it returns the English translation, not the French one

TEST: has() reflects cache state
  GIVEN a cache with a Translation for ("block-1", "en")
  THEN cache.has("block-1", "en") = true
  AND cache.has("block-1", "fr") = false
  AND cache.has("block-2", "en") = false

TEST: invalidate removes all translations for a block
  GIVEN translations cached for ("block-1", "en") and ("block-1", "fr")
  WHEN cache.invalidate("block-1") is called
  THEN cache.has("block-1", "en") = false
  AND cache.has("block-1", "fr") = false

TEST: invalidateAll clears entire cache
  GIVEN translations cached for multiple blocks and languages
  WHEN cache.invalidateAll() is called
  THEN cache.size() = 0

TEST: size() reflects number of cached entries
  GIVEN 3 translations put into the cache
  THEN cache.size() = 3
  WHEN one is invalidated
  THEN cache.size() = 2

TEST: put() overwrites existing entry for same block+language
  GIVEN a cached Translation for ("block-1", "en") with translatedText = "The house"
  WHEN a new Translation for ("block-1", "en") with translatedText = "The big house" is put
  THEN cache.get("block-1", "en").translatedText = "The big house"
  AND cache.size() does not increase
```

#### 3.6.2 Persistence

```
TEST: persist() saves current memory state to durable storage
  GIVEN 3 translations in memory cache
  WHEN cache.persist() is called
  AND a new cache instance calls cache.restore()
  THEN the new instance has the same 3 translations

TEST: restore() loads from durable storage into memory
  GIVEN a previously persisted cache with 5 entries
  WHEN a fresh cache instance calls cache.restore()
  THEN cache.size() = 5
  AND all 5 translations are retrievable by get()

TEST: restore() on empty storage results in empty cache
  GIVEN no previously persisted data
  WHEN cache.restore() is called
  THEN cache.size() = 0
  AND no error is thrown

TEST: persist() after invalidateAll() clears durable storage
  GIVEN a persisted cache with 3 entries
  WHEN cache.invalidateAll() is called
  AND cache.persist() is called
  AND a new instance calls cache.restore()
  THEN cache.size() = 0

TEST: Memory writes do NOT auto-persist
  GIVEN an empty persisted state
  WHEN cache.put(translation) is called but cache.persist() is NOT called
  AND a new cache instance calls cache.restore()
  THEN the new instance has size() = 0
```

### 3.7 Translation Prefetcher

#### 3.7.1 Viewport-Driven Behavior

```
TEST: Viewport change triggers batch translation of visible blocks
  GIVEN translationOverlay is enabled
  AND the prefetcher is configured with batchSize = 6
  WHEN onViewportChanged(visibleBlockIds=["b1","b2","b3"], nextBlockIds=["b4","b5","b6"]) is called
  THEN TranslationService.translateBatch is called with blocks b1, b2, b3
  AND blocks b4, b5, b6 are NOT yet translated

TEST: Already-cached blocks are excluded from translation requests
  GIVEN translations for b1 and b3 are already in the cache
  WHEN onViewportChanged(visibleBlockIds=["b1","b2","b3"], ...) is called
  THEN TranslationService.translateBatch is called with only [b2]

TEST: All visible blocks cached means no API call
  GIVEN translations for b1, b2, b3 are all cached
  WHEN onViewportChanged(visibleBlockIds=["b1","b2","b3"], ...) is called
  THEN TranslationService.translateBatch is NOT called

TEST: Prefetcher does nothing when translation overlay is disabled
  GIVEN translationOverlay is disabled in settings
  WHEN onViewportChanged is called with any block IDs
  THEN no translation requests are made
```

#### 3.7.2 Dwell-Based Prefetching

```
TEST: Dwell triggers prefetch of next-screen blocks
  GIVEN visibleBlockIds=["b1","b2","b3"] and nextBlockIds=["b4","b5","b6"]
  AND visible blocks are already translated
  WHEN onDwell(2000) is called (user stayed 2+ seconds)
  THEN TranslationService.translateBatch is called with blocks b4, b5, b6

TEST: Short dwell does NOT trigger prefetch
  GIVEN visibleBlockIds and nextBlockIds set
  WHEN onDwell(500) is called (under threshold)
  THEN no prefetch translation request is made for nextBlockIds

TEST: Dwell prefetch skips already-cached next blocks
  GIVEN nextBlockIds=["b4","b5","b6"] and b4 is already cached
  WHEN onDwell(2000) is called
  THEN prefetch request includes only [b5, b6]
```

#### 3.7.3 Cancellation

```
TEST: Viewport change cancels stale in-flight requests
  GIVEN a translation request is in-flight for blocks ["b1","b2","b3"]
  WHEN onViewportChanged(visibleBlockIds=["b10","b11","b12"], ...) is called
  THEN the in-flight request for b1, b2, b3 is cancelled
  AND a new request is made for b10, b11, b12

TEST: cancelAll() aborts all pending requests
  GIVEN multiple in-flight translation requests
  WHEN cancelAll() is called
  THEN all pending requests are cancelled
  AND getStatus for those blocks returns 'idle'

TEST: Cancelled request does not write to cache
  GIVEN a translation request for block b1 is in-flight
  WHEN the request is cancelled before the API responds
  THEN no Translation for b1 is written to the cache
```

#### 3.7.4 Status Tracking

```
TEST: Block status lifecycle
  GIVEN block b1 has never been translated
  THEN getStatus("b1") = 'idle'

  WHEN b1 is included in a viewport change
  THEN getStatus("b1") = 'queued' (briefly) then 'loading'

  WHEN the API responds successfully
  THEN getStatus("b1") = 'ready'

TEST: Error status on API failure
  GIVEN block b1 is being translated
  WHEN the API returns an error
  THEN getStatus("b1") = 'error'

TEST: Cached block reports 'ready' without any request
  GIVEN b1 is already in the translation cache
  THEN getStatus("b1") = 'ready'
```

### 3.8 Reading Position

```
TEST: Save and load reading position
  GIVEN a ReadingPosition for bookId="book-1", chapterId="ch-3", blockId="b-15"
  WHEN ReadingPositionService.save(position) is called
  AND ReadingPositionService.load("book-1") is called
  THEN the loaded position matches the saved one

TEST: Load for unknown book returns null
  WHEN ReadingPositionService.load("nonexistent-book") is called
  THEN the result is null

TEST: Save overwrites previous position for same book
  GIVEN a saved position at chapter 3
  WHEN a new position at chapter 5 is saved for the same book
  THEN load returns the chapter 5 position

TEST: Clear removes position
  GIVEN a saved position for book-1
  WHEN ReadingPositionService.clear("book-1") is called
  THEN ReadingPositionService.load("book-1") returns null

TEST: Positions for different books are independent
  GIVEN saved positions for book-1 and book-2
  WHEN clear("book-1") is called
  THEN load("book-2") still returns the book-2 position
```

### 3.9 User Settings

```
TEST: Default settings are provided
  GIVEN no previously saved settings
  WHEN SettingsService.get() is called
  THEN it returns a complete UserSettings with sensible defaults
  AND explanationLanguage = "en"
  AND readingMode = "paginated"
  AND theme = "warm"
  AND translationOverlayEnabled = false

TEST: Partial update merges with existing settings
  GIVEN default settings
  WHEN SettingsService.update({ fontSize: 20 }) is called
  THEN the returned settings have fontSize = 20
  AND all other fields retain their previous values

TEST: onChange notifies subscribers
  GIVEN a registered callback via onChange
  WHEN SettingsService.update({ theme: "dark" }) is called
  THEN the callback is invoked with the new settings
  AND the new settings have theme = "dark"

TEST: Multiple subscribers are all notified
  GIVEN two registered callbacks
  WHEN settings are updated
  THEN both callbacks are invoked

TEST: Unsubscribe stops notifications
  GIVEN a subscribed callback
  WHEN the unsubscribe function is called
  AND settings are updated
  THEN the callback is NOT invoked

TEST: reset() restores defaults
  GIVEN modified settings (theme="dark", fontSize=24)
  WHEN SettingsService.reset() is called
  THEN get() returns the default settings

TEST: Settings survive persist/restore cycle
  GIVEN modified settings
  WHEN settings are persisted (implementation-specific)
  AND a new SettingsService instance is created
  THEN get() returns the previously saved settings
```

### 3.10 Integration: Translation Overlay Toggle

This tests the coordination between settings, prefetcher, and cache.

```
TEST: Enabling overlay triggers translation of visible blocks
  GIVEN a book is open with 4 visible blocks and translationOverlayEnabled = false
  WHEN the user enables translationOverlayEnabled
  THEN the prefetcher begins translating the 4 visible blocks

TEST: Disabling overlay cancels in-flight translations
  GIVEN translationOverlayEnabled = true and translations are in-flight
  WHEN the user disables translationOverlayEnabled
  THEN all in-flight translation requests are cancelled

TEST: Re-enabling overlay uses cached translations
  GIVEN the overlay was enabled, blocks b1–b4 were translated, then overlay was disabled
  WHEN the overlay is re-enabled
  THEN blocks b1–b4 are served from cache (no new API calls)

TEST: Changing translation language invalidates cache and re-fetches
  GIVEN cached translations for blocks b1–b4 in English
  WHEN the user changes translationLanguage from "en" to "fr"
  AND the overlay is enabled
  THEN translations are re-fetched in French for visible blocks
  AND the English translations remain in cache (not invalidated — both languages coexist)
```

### 3.11 Integration: Explanation Flow

```
TEST: Selecting text and requesting explanation produces result
  GIVEN a book is open with a visible ContentBlock containing Spanish text
  WHEN the user selects "hidalgo" from that block
  AND requests an explanation with explanationLanguage = "en"
  THEN ExplanationService.explain is called with:
    - selectedText = "hidalgo"
    - contextBlock = the containing ContentBlock
    - sourceLanguage = book.language
    - explanationLanguage = "en"
  AND the returned Explanation has a non-empty explanation string

TEST: Changing explanation language affects subsequent explanations
  GIVEN explanationLanguage is "en"
  WHEN the user changes it to "fr"
  AND selects text and requests an explanation
  THEN the explanation is in French

TEST: Explanation uses book-level language as source, not block-level
  GIVEN a book with language = "es" and a block with no block-level language override
  WHEN an explanation is requested
  THEN sourceLanguage in the request = "es"

TEST: Explanation uses block-level language when present
  GIVEN a book with language = "es" but a specific block with language = "en"
  WHEN text from that block is selected and explained
  THEN sourceLanguage in the request = "en"
```

---

## 4. Architectural Invariants

These are properties that must ALWAYS hold, and can be verified as cross-cutting tests:

```
INVARIANT: The view layer never calls TranslationService or ExplanationService directly
  All AI interactions go through the Prefetcher (for translations) or a dispatched action (for explanations).

INVARIANT: FormatAdapters are the only code that knows about file format internals
  No code outside of an adapter references EPUB XML structure, PDF page objects, or format-specific parsing.

INVARIANT: The canonical Book model is immutable after import
  Once a Book is created by BookImportService, its chapters and blocks do not change.
  Language override mutates book.language and book.languageOverridden only.

INVARIANT: TranslationService and ExplanationService are stateless
  They do not cache, queue, or remember previous calls. Those concerns belong to the cache and prefetcher.

INVARIANT: Translation cache keys are always (blockId, targetLanguage) pairs
  No other combination of fields is used as a cache key.

INVARIANT: All services return Result types (success or typed error), never throw exceptions
  Error handling is explicit, not exceptional.

INVARIANT: No service depends on a specific AI provider
  The AI API is abstracted behind the TranslationService and ExplanationService interfaces.
  Swapping from one LLM provider to another requires changing only the implementation, not the interface or any consumer.
```

---

## 5. Module Dependency Graph

```
BookImportService
  ├── FormatAdapter (EPUB)
  ├── FormatAdapter (PDF)
  └── LanguageDetectionService

TranslationPrefetcher
  ├── TranslationService
  ├── TranslationCache
  └── SettingsService (reads translationOverlayEnabled, translationLanguage)

ExplanationService (standalone, no dependencies on other services)

ReadingPositionService (standalone)

SettingsService (standalone, persists to durable storage)

TranslationCache (standalone, two-tier: memory + durable storage)
```

No circular dependencies. The view layer (not specified here) depends on all of the above but none of the above depend on the view.
