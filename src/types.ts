export type SupportedLanguage = 'en' | 'ru';

export interface SyncNodeSettings {
  language: SupportedLanguage;
  webdavUrl: string;
  username: string;
  password: string;
  targetFolder: string;
  useDedicatedAttachments: boolean;
  attachmentsFolder: string;
  syncInterval: number; // minutes (0 = manual only)
  syncOnStartup: boolean;
  notifyOnSync: boolean;
  enableTemplate: boolean;
  noteTemplate: string;
  isConfigured: boolean;
}

export interface WebDavItem {
  href: string;
  isCollection: boolean;
  mtime: number;
  size: number;
}

export interface RemoteFile {
  relPath: string;
  mtime: number;
  size: number;
}

export interface TestConnectionResult {
  ok: boolean;
  status?: number;
  message: string;
}

export interface ParsedFrontmatter {
  hasFrontmatter: boolean;
  frontmatterText: string;
  body: string;
}

export interface TemplateOptions {
  template: string;
  filename: string;
  remoteMtime?: number;
  now?: Date;
}

export interface ConfigTokenPayload {
  v: number;
  language: SupportedLanguage;
  webdavUrl: string;
  username: string;
  password: string;
  targetFolder: string;
  useDedicatedAttachments: boolean;
  attachmentsFolder: string;
  syncInterval: number;
  syncOnStartup: boolean;
  notifyOnSync: boolean;
  enableTemplate: boolean;
  noteTemplate: string;
}
