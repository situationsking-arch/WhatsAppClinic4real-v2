import { describe, expect, it } from 'vitest';

import { type MagicLinkSender, MagicLinkService } from '@/server/auth/magic-link';
import { SignUpService } from '@/server/auth/sign-up';

describe('SignUpService', () => {
  it('sends a verification link that preserves the business profile for onboarding', async () => {
    const sender = new FakeMagicSender();
    const service = new SignUpService(
      new MagicLinkService(sender, 'https://app.test/auth/callback'),
      'https://app.test',
    );

    const result = await service.signUp({
      businessName: '  Studio Test ',
      email: '  Mario@Example.IT  ',
      vertical: 'dental',
      requestId: 'req_1',
    });

    expect(result).toEqual({ ok: true });
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0]?.email).toBe('mario@example.it');

    const callback = new URL(sender.calls[0]!.redirectTo);
    expect(callback.pathname).toBe('/auth/callback');
    const next = callback.searchParams.get('next');
    expect(next).toBe('/onboarding?business_name=Studio+Test&vertical=dental');

    // No tenant is created before the email owner verifies the address.
    expect(sender.calls[0]?.redirectTo).toContain('/auth/callback?next=');
  });

  it('rejects a business name shorter than two characters', async () => {
    const sender = new FakeMagicSender();
    const service = new SignUpService(
      new MagicLinkService(sender, 'https://app.test/auth/callback'),
      'https://app.test',
    );

    await expect(
      service.signUp({
        businessName: 'A',
        email: 'mario@example.it',
        vertical: 'dental',
        requestId: 'req_2',
      }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(sender.calls).toHaveLength(0);
  });

  it('does not reveal whether an email already has an account', async () => {
    const sender = new FakeMagicSender();
    const service = new SignUpService(
      new MagicLinkService(sender, 'https://app.test/auth/callback'),
      'https://app.test',
    );

    await expect(
      service.signUp({
        businessName: 'Another Studio',
        email: 'existing@example.it',
        vertical: 'beauty',
        requestId: 'req_3',
      }),
    ).resolves.toEqual({ ok: true });
    expect(sender.calls[0]?.email).toBe('existing@example.it');
  });
});

class FakeMagicSender implements MagicLinkSender {
  readonly calls: Array<{ email: string; redirectTo: string }> = [];

  async send(input: { email: string; redirectTo: string }): Promise<{ error: null }> {
    this.calls.push(input);
    return { error: null };
  }
}
