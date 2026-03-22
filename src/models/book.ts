import type { LanguageCode } from './language';

export interface Book {
  id: string;
  title: string;
  author: string;
  language: LanguageCode;
  languageConfidence: number;
  languageOverridden: boolean;
  coverImage: ArrayBuffer | null;
  tableOfContents: TocEntry[];
  chapters: Chapter[];
  metadata: Record<string, string>;
  importedAt: number;
  sourceFormat: string;
  sourceFileName: string;
}

export interface TocEntry {
  title: string;
  chapterId: string;
  depth: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  index: number;
  blocks: ContentBlock[];
}

export interface ContentBlock {
  id: string;
  chapterId: string;
  index: number;
  type: 'paragraph' | 'heading' | 'quote' | 'code' | 'image' | 'list';
  text: string;
  richContent: string | null;
  language: LanguageCode | null;
}
