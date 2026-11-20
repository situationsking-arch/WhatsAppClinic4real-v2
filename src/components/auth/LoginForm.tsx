'use client';

import { FormFeedback } from '@/components/forms/FormFeedback';
import { useApiForm } from '@/components/forms/useApiForm';

export function LoginForm() {
  const { state, onSubmit } = useApiForm({
    endpoint: '/api/auth/magic-link',
    successMessage:
      'Si cette adresse est associée à un compte, vous recevrez un lien de connexion dans quelques instants. Vérifiez également vos courriers indésirables.',
  });

  return (
    <form onSubmit={onSubmit} className="stack stack-4" noValidate>
      <FormFeedback state={state} id="login-form-errors" />

      <div className="field">
        <label htmlFor="email" className="label">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          placeholder="vous@entreprise.tn"
          className="input"
          aria-describedby="login-email-helper"
          disabled={state.status === 'submitting'}
        />
        <p className="helper" id="login-email-helper">
          Nous vous enverrons un lien sécurisé valable 10 minutes.
        </p>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={state.status === 'submitting'}
      >
        {state.status === 'submitting' ? 'Envoi en cours…' : 'Recevoir le lien de connexion'}
      </button>
    </form>
  );
}
