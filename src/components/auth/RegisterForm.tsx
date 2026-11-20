'use client';

import { FormFeedback } from '@/components/forms/FormFeedback';
import { useApiForm } from '@/components/forms/useApiForm';

const VERTICALS = [
  { value: 'dental', label: 'Cabinet dentaire' },
  { value: 'beauty', label: 'Centre esthétique / SPA' },
  { value: 'fitness', label: 'Salle de sport / Coach sportif' },
  { value: 'professional', label: 'Cabinet professionnel' },
  { value: 'other', label: 'Autre' },
] as const;

export function RegisterForm() {
  const { state, onSubmit } = useApiForm({
    endpoint: '/api/auth/sign-up',
    successMessage:
      'Demande reçue. Si cette adresse peut être utilisée, vous recevrez un e-mail contenant un lien sécurisé pour poursuivre la création de votre espace.',
  });

  const isSubmitting = state.status === 'submitting';

  return (
    <form onSubmit={onSubmit} className="stack stack-4" noValidate>
      <FormFeedback state={state} id="register-form-errors" />

      <div className="field">
        <label htmlFor="business_name" className="label">
          Nom de votre entreprise
        </label>
        <input
          id="business_name"
          name="business_name"
          type="text"
          autoComplete="organization"
          required
          minLength={2}
          maxLength={120}
          placeholder="Cabinet médical, centre esthétique…"
          className="input"
          disabled={isSubmitting}
        />
      </div>

      <div className="field">
        <label htmlFor="email" className="label">
          Adresse e-mail professionnelle
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          placeholder="contact@entreprise.tn"
          className="input"
          aria-describedby="register-email-helper"
          disabled={isSubmitting}
        />
        <p className="helper" id="register-email-helper">
          Cette adresse sera utilisée pour le compte principal de votre espace.
        </p>
      </div>

      <div className="field">
        <label htmlFor="vertical" className="label">
          Votre secteur d’activité
        </label>
        <select
          id="vertical"
          name="vertical"
          required
          className="select"
          defaultValue=""
          disabled={isSubmitting}
        >
          <option value="" disabled>
            Sélectionnez votre secteur
          </option>
          {VERTICALS.map((vertical) => (
            <option key={vertical.value} value={vertical.value}>
              {vertical.label}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn btn-primary btn-lg" disabled={isSubmitting}>
        {isSubmitting ? 'Création en cours…' : 'Créer mon espace'}
      </button>
    </form>
  );
}
