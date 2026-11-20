import { describe, expect, it } from 'vitest';
import {
  localDateRangeToUtc,
  localParts,
  matchesPartOfDay,
  normalizePhone,
  validateFullName,
  zonedLocalToUtc,
} from '@/server/ai/booking-agent-helpers';

describe('booking agent helpers', () => {
  it('normalizes Tunisian and international phone numbers', () => {
    expect(normalizePhone('22 123 456')).toBe('+21622123456');
    expect(normalizePhone('+216 98.765.432')).toBe('+21698765432');
    expect(normalizePhone('00216 55 111 222')).toBe('+21655111222');
    expect(normalizePhone('٩٨ ٧٦٥ ٤٣٢')).toBe('+21698765432');
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('12345678')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('0612345678')).toBeNull();
  });

  it('requires first and last name', () => {
    expect(validateFullName('  Mohamed   Ben Ali ')).toBe('Mohamed Ben Ali');
    expect(validateFullName('محمد بن علي')).toBe('محمد بن علي');
    expect(validateFullName('Sarra')).toBeNull();
    expect(validateFullName('A B')).toBeNull();
    expect(validateFullName('Sarra 123')).toBeNull();
  });

  it('converts clinic-local days to UTC windows', () => {
    const range = localDateRangeToUtc('2026-11-18', '2026-11-18', 'Africa/Tunis');
    expect(range?.from.toISOString()).toBe('2026-11-17T23:00:00.000Z');
    expect(range?.to.toISOString()).toBe('2026-11-18T23:00:00.000Z');
    expect(localDateRangeToUtc('2026-11-18', '2026-11-17', 'Africa/Tunis')).toBeNull();
    expect(localDateRangeToUtc('2026-11-18', '2026-12-30', 'Africa/Tunis')).toBeNull();
    expect(localDateRangeToUtc('2026-02-30', '2026-03-01', 'Africa/Tunis')).toBeNull();
    expect(zonedLocalToUtc(2026, 7, 1, 9, 0, 'Europe/Paris').toISOString()).toBe('2026-07-01T07:00:00.000Z');
  });

  it('describes local parts and day parts', () => {
    const parts = localParts(new Date('2026-11-18T08:30:00Z'), 'Africa/Tunis');
    expect([parts.date, parts.time, parts.weekday]).toEqual(['2026-11-18', '09:30', 'Wednesday']);
    expect(matchesPartOfDay(9, 'morning')).toBe(true);
    expect(matchesPartOfDay(14, 'morning')).toBe(false);
  });
});
