'use client';

import { useCallback, useState, type FormEvent } from 'react';

export type ApiFormStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface ApiFormState {
  readonly status: ApiFormStatus;
  readonly message: string | null;
}

interface ApiErrorEnvelope {
  ok: false;
  error: { code: string; message: string };
}

interface ApiSuccessEnvelope {
  ok: true;
  data: unknown;
}

export interface UseApiFormOptions {
  readonly endpoint: string;
  readonly successMessage: string;
  readonly redirectTo?: string;
  readonly buildBody?: (formData: FormData) => unknown;
}

const MESSAGE_BY_CODE: Record<string, string> = {
  rate_limited: 'Trop de tentatives. Veuillez patienter quelques minutes avant de réessayer.',
  bad_request: 'Certaines informations sont invalides. Vérifiez les champs et réessayez.',
  validation_error: 'Certaines informations sont invalides. Vérifiez les champs et réessayez.',
  unauthorized: 'Votre session n’est plus valide. Veuillez vous reconnecter.',
  forbidden: 'Vous n’avez pas l’autorisation d’effectuer cette opération.',
  not_found: 'La ressource demandée est introuvable.',
  conflict: 'Un compte existe déjà avec ces informations.',
};

const FALLBACK_MESSAGE =
  'Une erreur inattendue est survenue. Veuillez réessayer ou nous contacter si le problème persiste.';

function defaultBuildBody(formData: FormData): Record<string, string> {
  const body: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      body[key] = value;
    }
  }
  return body;
}

function messageFor(payload: unknown, httpStatus: number): string {
  const envelope = payload as Partial<ApiErrorEnvelope> | null;
  const code = envelope?.error?.code;

  if (code && MESSAGE_BY_CODE[code]) {
    return MESSAGE_BY_CODE[code];
  }

  const exposed = envelope?.error?.message;
  if (exposed && exposed !== 'Internal server error') {
    return exposed;
  }

  if (httpStatus >= 500) {
    return 'Le service est momentanément indisponible. Veuillez réessayer dans quelques instants.';
  }

  return FALLBACK_MESSAGE;
}

export function useApiForm(options: UseApiFormOptions): {
  state: ApiFormState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
} {
  const [state, setState] = useState<ApiFormState>({ status: 'idle', message: null });

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      const form = event.currentTarget;
      const formData = new FormData(form);
      const body = (options.buildBody ?? defaultBuildBody)(formData);

      setState({ status: 'submitting', message: null });

      let response: Response;
      try {
        response = await fetch(options.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        setState({
          status: 'error',
          message: 'Connexion impossible. Vérifiez votre réseau et réessayez.',
        });
        return;
      }

      let payload: unknown = null;
      try {
        payload = (await response.json()) as ApiSuccessEnvelope | ApiErrorEnvelope;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        setState({ status: 'error', message: messageFor(payload, response.status) });
        return;
      }

      form.reset();

      if (options.redirectTo !== undefined) {
        window.location.assign(options.redirectTo);
        return;
      }

      setState({ status: 'success', message: options.successMessage });
    },
    [options],
  );

  return { state, onSubmit };
}
