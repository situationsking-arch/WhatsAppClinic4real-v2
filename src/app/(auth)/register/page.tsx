import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Inscription · Ambrogio.ai',
  description: 'Créez votre espace Ambrogio.ai et configurez votre accueil client.',
  robots: { index: false, follow: false },
};

const TRIAL_INCLUDES = [
  '14 jours d’essai gratuit, sans carte bancaire',
  '500 conversations IA incluses pour tester',
  'Accompagnement à la configuration',
  'Résiliation à tout moment',
] as const;

export default function RegisterPage() {
  return (
    <div className="stack stack-6">
      <div className="stack stack-2">
        <span className="badge badge-success">Essai gratuit de 14 jours · Sans carte bancaire</span>
        <h1 style={{ fontSize: 'var(--text-3xl)' }}>Créez votre espace</h1>
        <p className="muted">
          Renseignez les informations de votre activité. Vous pourrez configurer WhatsApp et votre
          calendrier à l’étape suivante.
        </p>
      </div>

      <RegisterForm />

      <ul
        className="card stack stack-2"
        style={{
          listStyle: 'none',
          padding: 'var(--space-5)',
          background: 'var(--color-accent-soft)',
          border: '1px solid oklch(85% 0.05 175)',
        }}
      >
        {TRIAL_INCLUDES.map((item) => (
          <li
            key={item}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <span aria-hidden="true" style={{ color: 'var(--color-accent)', fontWeight: 700 }}>
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        Vous avez déjà un compte ?{' '}
        <Link href="/login" className="btn-link">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
