import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';

import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { requireSessionOrRedirect } from '@/lib/auth/guards';
import { DEFAULT_INTERFACE_LOCALE, isInterfaceLocale } from '@/lib/i18n/locale';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Il layout è il punto di controllo dell'intera area autenticata: qualunque
 * pagina sotto `(dashboard)` passa di qui, quindi una nuova schermata nasce già
 * protetta senza doversene ricordare. Il middleware non può assolvere a questo
 * compito: si occupa solo di CSP e non conosce la sessione Supabase.
 */
export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireSessionOrRedirect();
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = isInterfaceLocale(savedLocale) ? savedLocale : DEFAULT_INTERFACE_LOCALE;

  return <DashboardShell locale={locale}>{children}</DashboardShell>;
}
