export interface ImportError {
  code: 'UNSUPPORTED_FORMAT' | 'CORRUPT_FILE' | 'EMPTY_CONTENT' | 'PARSE_ERROR';
  message: string;
  details: string | null;
}

export interface TranslationError {
  code: 'API_ERROR' | 'RATE_LIMITED' | 'UNSUPPORTED_LANGUAGE' | 'EMPTY_INPUT' | 'CANCELLED';
  message: string;
  retryable: boolean;
}

export interface ExplanationError {
  code: 'API_ERROR' | 'RATE_LIMITED' | 'EMPTY_INPUT' | 'SELECTION_TOO_LONG';
  message: string;
  retryable: boolean;
}
