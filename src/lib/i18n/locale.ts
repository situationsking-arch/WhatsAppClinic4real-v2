export const SUPPORTED_LOCALES = ['fr', 'en', 'ar'] as const;
export type InterfaceLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_INTERFACE_LOCALE: InterfaceLocale = 'fr';

export const interfaceMessages = {
  fr: {
    activeTenant: 'Espace actif',
    overview: 'Vue d’ensemble',
    conversations: 'Conversations',
    calendar: 'Calendrier',
    knowledge: 'Base de connaissances',
    settings: 'Paramètres',
    billing: 'Facturation',
    help: 'Centre d’aide',
    language: 'Langue',
    languageFrench: 'Français',
    languageEnglish: 'Anglais',
    languageArabic: 'Arabe',
  },
  en: {
    activeTenant: 'Active workspace',
    overview: 'Overview',
    conversations: 'Conversations',
    calendar: 'Calendar',
    knowledge: 'Knowledge base',
    settings: 'Settings',
    billing: 'Billing',
    help: 'Help center',
    language: 'Language',
    languageFrench: 'French',
    languageEnglish: 'English',
    languageArabic: 'Arabic',
  },
  ar: {
    activeTenant: 'مساحة العمل الحالية',
    overview: 'نظرة عامة',
    conversations: 'المحادثات',
    calendar: 'التقويم',
    knowledge: 'قاعدة المعرفة',
    settings: 'الإعدادات',
    billing: 'الفوترة',
    help: 'مركز المساعدة',
    language: 'اللغة',
    languageFrench: 'الفرنسية',
    languageEnglish: 'الإنجليزية',
    languageArabic: 'العربية',
  },
} satisfies Record<InterfaceLocale, Record<string, string>>;

export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as InterfaceLocale);
}

export function getInterfaceDirection(locale: InterfaceLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
