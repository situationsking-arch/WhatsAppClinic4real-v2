import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Connexion · Ambrogio.ai',
  description: 'Connectez-vous à votre espace Ambrogio.ai',
  robots: { index: false, follow: false },
};

const CALLBACK_ERRORS: Record<string, string> = {
  link_non_valide:
    'Ce lien de connexion est invalide ou a déjà expiré. Demandez un nouveau lien ci-dessous.',
  link_incomplet:
    'Le lien de connexion est incomplet. Demandez un nouveau lien pour continuer.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const callbackError = params.error ? CALLBACK_ERRORS[params.error] : undefined;

  return (
    <div className="stack stack-6">
      <div className="stack stack-2">
        <h1 style={{ fontSize: 'var(--text-3xl)' }}>Bon retour parmi nous</h1>
        <p className="muted">
          Saisissez votre adresse e-mail. Nous vous enverrons un lien sécurisé pour vous connecter,
          sans mot de passe.
        </p>
      </div>

      {callbackError ? (
        <p
          role="alert"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-danger-soft)',
            color: 'var(--color-danger)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {callbackError}
        </p>
      ) : null}

      <LoginForm />

      <div
        className="stack stack-3"
        style={{
          paddingTop: 'var(--space-6)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Vous n’avez pas encore de compte ?{' '}
          <Link href="/register" className="btn-link">
            Créer votre espace
          </Link>
        </p>
        <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          En cliquant sur « Recevoir le lien », vous acceptez les{' '}
          <Link href="/legal/terms" className="btn-link">
            conditions d’utilisation
          </Link>{' '}
          et la{' '}
          <Link href="/legal/privacy" className="btn-link">
            politique de confidentialité
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
