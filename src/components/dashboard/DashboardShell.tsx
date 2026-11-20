import Link from 'next/link';
import type { ReactNode } from 'react';

import { LanguageSelector } from '@/components/layout/LanguageSelector';
import { interfaceMessages, type InterfaceLocale } from '@/lib/i18n/locale';

const SIDEBAR_ITEMS = [
  { href: '/dashboard', key: 'overview', icon: '◐' },
  { href: '/conversations', key: 'conversations', icon: '✻' },
  { href: '/calendar', key: 'calendar', icon: '◫' },
  { href: '/knowledge', key: 'knowledge', icon: '☰' },
  { href: '/settings', key: 'settings', icon: '⚙' },
  { href: '/billing', key: 'billing', icon: '€' },
] as const;

export interface DashboardShellProps {
  children: ReactNode;
  currentPath?: string;
  tenantName?: string;
  locale: InterfaceLocale;
}

export function DashboardShell({
  children,
  currentPath,
  tenantName = 'Il tuo studio',
  locale,
}: Readonly<DashboardShellProps>) {
  const messages = interfaceMessages[locale];
  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Navigazione dashboard">
        <Link
          href="/dashboard"
          className="site-logo"
          style={{ fontSize: 'var(--text-base)', display: 'block' }}
        >
          Ambrogio<span style={{ color: 'var(--color-accent)' }}>.ai</span>
        </Link>

        <div
          className="surface-flat"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            marginTop: 'var(--space-5)',
          }}
        >
          <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            {messages.activeTenant}
          </p>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              marginTop: '2px',
            }}
          >
            {tenantName}
          </p>
        </div>

        <ul className="sidebar-nav">
          {SIDEBAR_ITEMS.map((item) => {
            const active = currentPath === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="sidebar-link"
                  aria-current={active ? 'page' : undefined}
                >
                  <span aria-hidden="true" style={{ width: '1.25rem' }}>
                    {item.icon}
                  </span>
                  {messages[item.key]}
                </Link>
              </li>
            );
          })}
        </ul>

        <div
          style={{
            position: 'absolute',
            bottom: 'var(--space-6)',
            insetInlineStart: 'var(--space-6)',
            insetInlineEnd: 'var(--space-6)',
          }}
        >
          <Link href="/help" className="sidebar-link" style={{ fontSize: 'var(--text-xs)' }}>
            <span aria-hidden="true">?</span>
            {messages.help}
          </Link>
        </div>
      </aside>

      <main className="dashboard-main" id="main">
        <div className="dashboard-toolbar">
          <LanguageSelector locale={locale} />
        </div>
        {children}
      </main>
    </div>
  );
}
