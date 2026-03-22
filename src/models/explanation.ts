import type { LanguageCode } from './language';

export interface Explanation {
  id: string;
  selectedText: string;
  contextBlockId: string;
  contextText: string;
  sourceLanguage: LanguageCode;
  explanationLanguage: LanguageCode;
  explanation: string;
  createdAt: number;
}
