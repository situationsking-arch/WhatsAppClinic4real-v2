import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('deployment locale profile defaults', () => {
  it('uses Tunisia defaults when LOCALE_PROFILE=tn', async () => {
    vi.stubEnv('LOCALE_PROFILE', 'tn');
    vi.resetModules();
    const { getLocaleProfileDefaults } = await import('@/lib/i18n/locale-profile');
    expect(getLocaleProfileDefaults()).toEqual({
      country: 'TN',
      timezone: 'Africa/Tunis',
      locale: 'fr-FR',
    });
  });

  it('preserves Italian defaults for the Italian profile', async () => {
    vi.stubEnv('LOCALE_PROFILE', 'it');
    vi.resetModules();
    const { getLocaleProfileDefaults } = await import('@/lib/i18n/locale-profile');
    expect(getLocaleProfileDefaults()).toEqual({
      country: 'IT',
      timezone: 'Europe/Rome',
      locale: 'it-IT',
    });
  });
});
