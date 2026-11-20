import { describe, expect, it } from 'vitest';
import { AgentBookingBridge, buildAgentSystemPrompt } from '@/server/ai/booking-agent';
import type {
  BookingBridgeRepository,
  ConversationBookingState,
} from '@/server/ai/booking-bridge';
import type { AgentTool } from '@/server/ai/gemini-agent';
import { AppError } from '@/lib/errors/app-error';

const TENANT = 'tenant-1';
const NOW = new Date('2026-11-17T09:00:00.000Z');
const SLOT_START = '2026-11-18T09:00:00.000Z';

function slot(start: string) {
  return {
    tenantId: TENANT,
    serviceId: 'svc-1',
    serviceName: 'Consultation',
    start,
    end: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(),
    durationMinutes: 30,
    timezone: 'Africa/Tunis',
  };
}

function setup(options: { priorAssistant: boolean; createError?: Error; owned?: boolean }) {
  let state: ConversationBookingState | null = null;
  const created: Array<Record<string, unknown>> = [];
  const cancelled: string[] = [];
  const repository: BookingBridgeRepository = {
    getTenantTimezone: async () => 'Africa/Tunis',
    listActiveServices: async () => [
      { id: 'svc-1', name: 'Consultation', durationMinutes: 30, priceCents: null },
    ],
    getConversationBookingState: async () => state,
    saveConversationBookingState: async (input) => {
      state = input.state;
    },
    clearConversationBookingState: async () => {
      state = null;
    },
    listCustomerAppointments: async () =>
      options.owned
        ? [
            {
              appointmentId: 'appt-1',
              serviceId: 'svc-1',
              serviceName: 'Consultation',
              customerName: 'Sarra Ben Ali',
              scheduledAt: new Date(SLOT_START),
              durationMinutes: 30,
            },
          ]
        : [],
  };
  const bookingService = {
    getAvailableSlots: async () => [slot(SLOT_START)],
    createAppointment: async (input: Record<string, unknown>) => {
      if (options.createError) {
        throw options.createError;
      }
      created.push(input);
      return { appointmentId: 'new-1', scheduledAt: SLOT_START };
    },
    cancelAppointment: async (input: { appointmentId: string }) => {
      cancelled.push(input.appointmentId);
      return {};
    },
    rescheduleAppointment: async () => ({ scheduledAt: SLOT_START }),
  };
  const context = {
    load: async () => ({
      conversationMessages: options.priorAssistant
        ? [
            { id: '1', role: 'assistant', direction: 'outbound', text: 'Résumé ?', messageType: 'text', createdAt: '' },
          ]
        : [],
      activePrompt: null,
      knowledgeBase: [],
      metadata: {},
    }),
  };
  let tools: AgentTool[] = [];
  const calls: Array<{ name: string; result: Record<string, unknown> }> = [];
  const bridge = new AgentBookingBridge({
    repository,
    bookingService: bookingService as never,
    context: context as never,
    apiKey: 'k',
    model: 'm',
    run: async (input) => {
      tools = input.tools;
      return { text: 'réponse', toolCalls: [], inputTokens: 0, outputTokens: 0, steps: 1 };
    },
  });
  const call = async (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((entry) => entry.name === name);
    const result = (await tool?.execute(args)) as Record<string, unknown>;
    calls.push({ name, result });
    return result;
  };
  const turn = (intent: 'booking_request' | 'other' = 'booking_request') =>
    bridge.createBookingReply({
      tenantId: TENANT,
      conversationId: 'conv-1',
      customerIdentifier: '+21622123456',
      customerName: null,
      text: 'nheb na7ou rendez-vous',
      occurredAt: NOW,
      intent,
    });

  return { turn, call, created, cancelled, getState: () => state };
}

const goodArgs = {
  service_id: 'svc-1',
  start_iso: SLOT_START,
  full_name: 'Sarra Ben Ali',
  phone: '22 123 456',
  patient_confirmed: true,
};

describe('AgentBookingBridge', () => {
  it('ignores messages that are not booking related and have no active session', async () => {
    const { turn } = setup({ priorAssistant: true });
    expect((await turn('other')).handled).toBe(false);
  });

  it('handles booking intent and keeps an agent session open', async () => {
    const { turn, getState } = setup({ priorAssistant: true });
    const reply = await turn();
    expect(reply.handled).toBe(true);
    expect(getState()?.status).toBe('agent_session');
  });

  it('refuses to book without explicit confirmation or a prior assistant summary', async () => {
    const { turn, call, created } = setup({ priorAssistant: false });
    await turn();
    expect((await call('create_appointment', goodArgs))['error']).toBe('explicit_confirmation_required');
    expect(created).toHaveLength(0);
  });

  it('refuses invalid phone and one-word names', async () => {
    const { turn, call, created } = setup({ priorAssistant: true });
    await turn();
    expect((await call('create_appointment', { ...goodArgs, phone: '123' }))['error']).toBe('invalid_phone');
    expect((await call('create_appointment', { ...goodArgs, full_name: 'Sarra' }))['error']).toBe('invalid_full_name');
    expect(created).toHaveLength(0);
  });

  it('refuses a time that is not a real free slot', async () => {
    const { turn, call, created } = setup({ priorAssistant: true });
    await turn();
    const result = await call('create_appointment', { ...goodArgs, start_iso: '2026-11-18T10:00:00.000Z' });
    expect(result['error']).toBe('slot_not_available');
    expect(created).toHaveLength(0);
  });

  it('books a real slot with normalized phone, and no Italian auto-confirmation', async () => {
    const { turn, call, created } = setup({ priorAssistant: true });
    await turn();
    const result = await call('create_appointment', goodArgs);
    expect(result['ok']).toBe(true);
    expect(created[0]?.['customerPhone']).toBe('+21622123456');
    expect(created[0]?.['customerName']).toBe('Sarra Ben Ali');
    expect(created[0]?.['sendConfirmation']).toBe(false);
    expect(created[0]?.['bookingSource']).toBe('whatsapp_ai');
  });

  it('reports a taken slot instead of crashing on a conflict', async () => {
    const { turn, call } = setup({
      priorAssistant: true,
      createError: new AppError('conflict', 'slot taken'),
    });
    await turn();
    expect((await call('create_appointment', goodArgs))['error']).toBe('slot_taken');
  });

  it('only cancels appointments that belong to this patient', async () => {
    const stranger = setup({ priorAssistant: true, owned: false });
    await stranger.turn();
    expect(
      (await stranger.call('cancel_appointment', { appointment_id: 'appt-1', patient_confirmed: true }))['error'],
    ).toBe('appointment_not_found');
    expect(stranger.cancelled).toHaveLength(0);

    const owner = setup({ priorAssistant: true, owned: true });
    await owner.turn();
    expect(
      (await owner.call('cancel_appointment', { appointment_id: 'appt-1', patient_confirmed: true }))['ok'],
    ).toBe(true);
    expect(owner.cancelled).toEqual(['appt-1']);
  });

  it('flags a handoff when the agent asks for the secretary', async () => {
    const { turn, call } = setup({ priorAssistant: true });
    await turn();
    expect((await call('request_secretary', { reason: 'douleur' }))['ok']).toBe(true);
  });

  it('falls back to a bilingual message and a handoff if the AI fails', async () => {
    const bridge = new AgentBookingBridge({
      repository: setupRepositoryOnly(),
      bookingService: {} as never,
      context: null,
      apiKey: 'k',
      model: 'm',
      run: async () => {
        throw new Error('gemini down');
      },
    });
    const reply = await bridge.createBookingReply({
      tenantId: TENANT,
      conversationId: 'c',
      customerIdentifier: '+21622123456',
      customerName: null,
      text: 'rdv',
      occurredAt: NOW,
      intent: 'booking_request',
    });
    expect(reply.handled).toBe(true);
    expect(reply.replyText).toMatch(/secrétaire/);
    expect(reply.replyText).toMatch(/السكرتيرة/);
    expect(JSON.stringify(reply.metadata)).toContain('handoffRequested');
  });

  it('builds a prompt with the date table and medical guardrail', () => {
    const prompt = buildAgentSystemPrompt({
      now: NOW,
      timezone: 'Africa/Tunis',
      services: [{ id: 'svc-1', name: 'Consultation', durationMinutes: 30, priceCents: null }],
      whatsappNumber: '+21622123456',
      personaExtra: null,
    });
    expect(prompt).toMatch(/2026-11-17 \(Tuesday\)/);
    expect(prompt).toMatch(/SAMU 190/);
    expect(prompt).toMatch(/Never give medical advice/);
  });
});

function setupRepositoryOnly(): BookingBridgeRepository {
  return {
    getTenantTimezone: async () => 'Africa/Tunis',
    listActiveServices: async () => [{ id: 's', name: 'S', durationMinutes: 30, priceCents: null }],
    getConversationBookingState: async () => null,
    saveConversationBookingState: async () => undefined,
    clearConversationBookingState: async () => undefined,
    listCustomerAppointments: async () => [],
  };
}
