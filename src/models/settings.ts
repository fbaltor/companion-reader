import type { LanguageCode } from './language';

export interface UserSettings {
  explanationLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  readingMode: 'paginated' | 'scroll';
  theme: 'warm' | 'dark';
  fontSize: number;
  fontFamily: string;
  translationOverlayEnabled: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  explanationLanguage: 'en',
  translationLanguage: 'en',
  readingMode: 'paginated',
  theme: 'warm',
  fontSize: 16,
  fontFamily: 'Georgia, serif',
  translationOverlayEnabled: false,
};
