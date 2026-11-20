import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INTERFACE_LOCALE,
  getInterfaceDirection,
  interfaceMessages,
  isInterfaceLocale,
} from '@/lib/i18n/locale';

describe('interface locale', () => {
  it('defaults new sessions to French', () => {
    expect(DEFAULT_INTERFACE_LOCALE).toBe('fr');
  });

  it('supports only the three configured interface languages', () => {
    expect(isInterfaceLocale('fr')).toBe(true);
    expect(isInterfaceLocale('en')).toBe(true);
    expect(isInterfaceLocale('ar')).toBe(true);
    expect(isInterfaceLocale('it')).toBe(false);
  });

  it('sets RTL only for Arabic', () => {
    expect(getInterfaceDirection('ar')).toBe('rtl');
    expect(getInterfaceDirection('fr')).toBe('ltr');
    expect(getInterfaceDirection('en')).toBe('ltr');
  });

  it('provides the same navigation keys in every locale', () => {
    expect(Object.keys(interfaceMessages.fr).sort()).toEqual(
      Object.keys(interfaceMessages.en).sort(),
    );
    expect(Object.keys(interfaceMessages.fr).sort()).toEqual(
      Object.keys(interfaceMessages.ar).sort(),
    );
  });
});
