# Supabase Auth setup notes

New project: `whatsapp-receptionist`
Project ref: `qffylxozronqhbyitqjf`
Project URL: `https://qffylxozronqhbyitqjf.supabase.co`
Region: `eu-central-1` (Frankfurt)

The public publishable key is prefilled in `.env.example`. Do not put a secret/service-role key in any `NEXT_PUBLIC_` variable.

## Required local setup
1. Copy `.env.example` to `.env.local`.
2. In Supabase Dashboard → Project Settings → API Keys, copy the **Secret key** into `SUPABASE_SERVICE_ROLE_KEY` (server only). Never commit `.env.local`.
3. In Supabase Dashboard → Authentication → URL Configuration, set Site URL to `http://localhost:3000`. Add `http://localhost:3000/auth/callback` to Redirect URLs. Add the production callback URL only after deploying to a real domain.
4. In Authentication → Providers → Email, ensure Email provider is enabled. The app uses passwordless Magic Link. Configure SMTP before production; default email delivery is rate-limited and intended only for initial testing.
5. Run `npm install` using Node.js 22, then `npm run typecheck`, `npm run lint`, and `npm test`.

## Important scope
The connected Supabase project has the 21 application tables, tenant-scoped RLS policies, membership/onboarding RPCs, tenant settings RPC, and an appointment-overlap trigger. This ZIP includes an SSR middleware update to refresh Supabase sessions while preserving CSP/security headers. It does not contain a generated `.env.local` or any server secret.
