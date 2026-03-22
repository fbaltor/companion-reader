import type { LanguageCode } from './language';

export interface Translation {
  id: string;
  blockId: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sourceText: string;
  translatedText: string;
  createdAt: number;
}
