import type { Result } from '../models/result';
import type { Book, ContentBlock } from '../models/book';
import type { Translation } from '../models/translation';
import type { Explanation } from '../models/explanation';
import type { UserSettings } from '../models/settings';
import type { ReadingPosition } from '../models/position';
import type { LanguageCode } from '../models/language';
import type { ImportError, TranslationError, ExplanationError } from '../models/errors';

// --- Book Import ---

export interface FileInput {
  name: string;
  data: ArrayBuffer;
  mimeType: string | null;
}

export interface BookImportService {
  import(file: FileInput): Promise<Result<Book, ImportError>>;
  getSupportedFormats(): string[];
}

export interface FormatAdapter {
  canHandle(file: FileInput): boolean;
  parse(file: FileInput): Promise<Result<Book, ImportError>>;
}

// --- Language Detection ---

export interface LanguageDetectionResult {
  language: LanguageCode;
  confidence: number;
  alternatives: { language: LanguageCode; confidence: number }[];
}

export interface LanguageDetectionService {
  detect(text: string): LanguageDetectionResult;
}

// --- Translation ---

export interface TranslationService {
  translateBlock(
    block: ContentBlock,
    targetLang: LanguageCode,
    sourceLang: LanguageCode,
  ): Promise<Result<Translation, TranslationError>>;

  translateBatch(
    blocks: ContentBlock[],
    targetLang: LanguageCode,
    sourceLang: LanguageCode,
  ): Promise<Result<Translation[], TranslationError>>;
}

// --- Explanation ---

export interface ExplanationRequest {
  selectedText: string;
  contextBlock: ContentBlock;
  sourceLanguage: LanguageCode;
  explanationLanguage: LanguageCode;
}

export interface ExplanationService {
  explain(request: ExplanationRequest): Promise<Result<Explanation, ExplanationError>>;
}

// --- Translation Cache ---

export interface TranslationCache {
  get(blockId: string, targetLang: LanguageCode): Translation | null;
  put(translation: Translation): void;
  has(blockId: string, targetLang: LanguageCode): boolean;
  invalidate(blockId: string): void;
  invalidateAll(): void;
  persist(): Promise<void>;
  restore(): Promise<void>;
  size(): number;
}

// --- Translation Prefetcher ---

export type BlockTranslationStatus = 'idle' | 'queued' | 'loading' | 'ready' | 'error';

export interface PrefetcherConfig {
  batchSize: number;
  dwellThresholdMs: number;
  maxConcurrentRequests: number;
  cancelStaleRequests: boolean;
}

export const DEFAULT_PREFETCHER_CONFIG: PrefetcherConfig = {
  batchSize: 6,
  dwellThresholdMs: 2000,
  maxConcurrentRequests: 2,
  cancelStaleRequests: true,
};

export interface TranslationPrefetcher {
  onViewportChanged(visibleBlockIds: string[], nextBlockIds: string[]): void;
  onDwell(durationMs: number): void;
  cancelAll(): void;
  getStatus(blockId: string): BlockTranslationStatus;
}

// --- Reading Position ---

export interface ReadingPositionService {
  save(position: ReadingPosition): void;
  load(bookId: string): ReadingPosition | null;
  clear(bookId: string): void;
}

// --- Settings ---

export type Unsubscribe = () => void;

export interface SettingsService {
  get(): UserSettings;
  update(partial: Partial<UserSettings>): UserSettings;
  reset(): UserSettings;
  onChange(callback: (settings: UserSettings) => void): Unsubscribe;
}
