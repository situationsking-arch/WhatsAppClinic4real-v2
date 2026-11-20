/**
 * Funzioni pure per l'agente di prenotazione (nessun import: testabili da sole).
 */

export type PartOfDay = 'any' | 'morning' | 'afternoon' | 'evening';

/** Offset (ms) del fuso `timeZone` rispetto a UTC nell'istante `utcMs`. */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const pick = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour'),
    pick('minute'),
    pick('second'),
  );

  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Converte una data/ora locale nel fuso indicato in un istante UTC. */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = timeZoneOffsetMs(guess, timeZone);
  let utc = guess - firstOffset;
  const secondOffset = timeZoneOffsetMs(utc, timeZone);

  if (secondOffset !== firstOffset) {
    utc = guess - secondOffset;
  }

  return new Date(utc);
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = DATE_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));

  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }

  return { y, m, d };
}

/**
 * Finestra [from, to) che copre i giorni locali da `dateFrom` a `dateTo` inclusi.
 * Restituisce null se le date non sono valide, invertite o oltre `maxDays`.
 */
export function localDateRangeToUtc(
  dateFrom: unknown,
  dateTo: unknown,
  timeZone: string,
  maxDays = 14,
): { from: Date; to: Date } | null {
  const start = parseIsoDate(dateFrom);
  const end = parseIsoDate(dateTo ?? dateFrom);

  if (!start || !end) {
    return null;
  }

  const from = zonedLocalToUtc(start.y, start.m, start.d, 0, 0, timeZone);
  const to = zonedLocalToUtc(end.y, end.m, end.d + 1, 0, 0, timeZone);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);

  if (days < 1 || days > maxDays) {
    return null;
  }

  return { from, to };
}

export function localParts(
  instant: Date,
  timeZone: string,
): { date: string; time: string; weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
  }).formatToParts(instant);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';

  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${pick('hour')}:${pick('minute')}`,
    weekday: pick('weekday'),
    hour: Number(pick('hour')),
  };
}

export function matchesPartOfDay(hour: number, part: PartOfDay): boolean {
  switch (part) {
    case 'morning':
      return hour < 12;
    case 'afternoon':
      return hour >= 12 && hour < 17;
    case 'evening':
      return hour >= 17;
    default:
      return true;
  }
}

/** Nome e cognome: almeno due parole di lettere (qualsiasi alfabeto). */
export function validateFullName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const name = raw.trim().replace(/\s+/g, ' ');

  if (name.length < 5 || name.length > 80) {
    return null;
  }

  const tokens = name.split(' ');

  if (tokens.length < 2) {
    return null;
  }

  const tokenPattern = /^\p{L}[\p{L}\p{M}'’.-]*$/u;

  return tokens.every((token) => token.length >= 2 && tokenPattern.test(token)) ? name : null;
}

/**
 * Normalizza un numero di telefono in formato internazionale.
 * Tunisia: 8 cifre che iniziano con 2, 3, 4, 5, 7 o 9 -> +216XXXXXXXX.
 * Altri paesi: accettati solo se scritti con prefisso internazionale (+ o 00).
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  // Cifre arabo-indiche -> cifre latine.
  const latin = raw.replace(/[\u0660-\u0669]/g, (digit) =>
    String(digit.charCodeAt(0) - 0x0660),
  );
  const compact = latin.replace(/[\s().-]/g, '');

  if (!/^\+?\d+$/.test(compact)) {
    return null;
  }

  let digits = compact.startsWith('+') ? compact.slice(1) : compact;
  const hasInternationalPrefix = compact.startsWith('+') || digits.startsWith('00');

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (!hasInternationalPrefix) {
    if (/^[234579]\d{7}$/.test(digits)) {
      return `+216${digits}`;
    }

    if (/^216[234579]\d{7}$/.test(digits)) {
      return `+${digits}`;
    }

    return null;
  }

  if (digits.startsWith('216')) {
    return /^216[234579]\d{7}$/.test(digits) ? `+${digits}` : null;
  }

  return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}
