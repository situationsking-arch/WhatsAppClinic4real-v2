'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { InterfaceLocale } from '@/lib/i18n/locale';

const OPTIONS: Array<{ value: InterfaceLocale; label: string }> = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
];

export function LanguageSelector({ locale }: { locale: InterfaceLocale }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function changeLocale(nextLocale: InterfaceLocale) {
    if (nextLocale === locale || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/settings/interface-language', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (response.ok) {
        router.refresh();
      }
    } catch {
      // Keep the current locale when the preference endpoint is unreachable.
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="interface-language-selector">
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={locale}
        disabled={saving}
        onChange={(event) => void changeLocale(event.target.value as InterfaceLocale)}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
