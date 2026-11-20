import { env } from '@/lib/env';

export type LocaleProfileDefaults = {
  country: 'IT' | 'TN';
  timezone: string;
  locale: 'it-IT' | 'fr-FR';
};

/** Deployment defaults only. A tenant's explicitly saved settings always win. */
export function getLocaleProfileDefaults(): LocaleProfileDefaults {
  return env.LOCALE_PROFILE === 'tn'
    ? { country: 'TN', timezone: 'Africa/Tunis', locale: 'fr-FR' }
    : { country: 'IT', timezone: 'Europe/Rome', locale: 'it-IT' };
}
