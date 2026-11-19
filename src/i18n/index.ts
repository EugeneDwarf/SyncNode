import { SupportedLanguage } from '../types';
import { en, TranslationDict } from './en';
import { ru } from './ru';

export { en, ru };
export type { TranslationDict };

const dictionaries: Record<SupportedLanguage, TranslationDict> = {
  en,
  ru
};

export type I18nKey = keyof TranslationDict;

export function getTranslation(
  lang: SupportedLanguage,
  key: I18nKey,
  ...args: any[]
): string {
  const dict = dictionaries[lang] || dictionaries.en;
  const val = dict[key] || dictionaries.en[key] || (key as string);
  if (typeof val === 'function') {
    return (val as (...a: any[]) => string)(...args);
  }
  return val as string;
}
