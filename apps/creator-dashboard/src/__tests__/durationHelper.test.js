import { describe, it, expect } from 'vitest';
import {
  getAccessDurationDays,
  calculateExpirationDate,
  getAccessDurationLabel,
  getAccessTypeLabel,
  getDurationLabel,
  getStatusLabel,
} from '../utils/durationHelper';

// ============ getAccessDurationDays ============

describe('getAccessDurationDays', () => {
  it.each([
    ['monthly',   30],
    ['3-month',   90],
    ['6-month',  180],
    ['yearly',   365],
    ['one-time', 365],
  ])('maps %s → %d days', (input, expected) => {
    expect(getAccessDurationDays(input)).toBe(expected);
  });

  it('returns 30 as fallback for unknown values', () => {
    expect(getAccessDurationDays('unknown')).toBe(30);
    expect(getAccessDurationDays('')).toBe(30);
    expect(getAccessDurationDays(null)).toBe(30);
  });
});

// ============ calculateExpirationDate ============

describe('calculateExpirationDate', () => {
  it('returns an ISO string', () => {
    expect(calculateExpirationDate('monthly')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns a date approximately N days in the future', () => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const cases = [
      ['monthly',  30],
      ['3-month',  90],
      ['yearly',  365],
    ];
    for (const [duration, days] of cases) {
      const before = Date.now();
      const result = new Date(calculateExpirationDate(duration)).getTime();
      const after = Date.now();
      const toleranceMs = 2000;
      expect(result).toBeGreaterThanOrEqual(before + days * MS_PER_DAY - toleranceMs);
      expect(result).toBeLessThanOrEqual(after  + days * MS_PER_DAY + toleranceMs);
    }
  });
});

// ============ getAccessDurationLabel ============

describe('getAccessDurationLabel', () => {
  it.each([
    ['monthly',      'Mensual'],
    ['yearly',       'Anual'],
    ['3-month',      '3 Meses'],
    ['6-month',      '6 Meses'],
    ['one-time',     'Una vez'],
    ['subscription', 'Suscripción'],
  ])('maps %s → "%s"', (input, expected) => {
    expect(getAccessDurationLabel(input)).toBe(expected);
  });

  it('returns the raw value for unknown duration strings', () => {
    expect(getAccessDurationLabel('custom-plan')).toBe('custom-plan');
  });

  it('returns "No especificado" for falsy input', () => {
    expect(getAccessDurationLabel(null)).toBe('No especificado');
    expect(getAccessDurationLabel('')).toBe('No especificado');
    expect(getAccessDurationLabel(undefined)).toBe('No especificado');
  });
});

// ============ getAccessTypeLabel ============

describe('getAccessTypeLabel', () => {
  it('returns "Suscripción" only for monthly', () => {
    expect(getAccessTypeLabel('monthly')).toBe('Suscripción');
  });

  it.each(['yearly', '3-month', '6-month', 'one-time'])(
    'returns "Pago único" for %s',
    (input) => {
      expect(getAccessTypeLabel(input)).toBe('Pago único');
    }
  );

  it('returns "No especificado" for falsy input', () => {
    expect(getAccessTypeLabel(null)).toBe('No especificado');
    expect(getAccessTypeLabel('')).toBe('No especificado');
  });
});

// ============ getDurationLabel ============

describe('getDurationLabel', () => {
  it('passes "Mensual" through unchanged', () => {
    expect(getDurationLabel('Mensual')).toBe('Mensual');
  });

  it('parses week strings', () => {
    expect(getDurationLabel('4 semanas')).toBe('4 Semanas');
    expect(getDurationLabel('1 semana')).toBe('1 Semana');
    expect(getDurationLabel('12 semanas')).toBe('12 Semanas');
  });

  it('formats numbers as weeks', () => {
    expect(getDurationLabel(4)).toBe('4 Semanas');
    expect(getDurationLabel(1)).toBe('1 Semana');
  });

  it('returns "No especificado" for null/undefined', () => {
    expect(getDurationLabel(null)).toBe('No especificado');
    expect(getDurationLabel(undefined)).toBe('No especificado');
  });

  it('returns an unrecognised string as-is', () => {
    expect(getDurationLabel('custom duration')).toBe('custom duration');
  });
});

// ============ getStatusLabel ============

describe('getStatusLabel', () => {
  it.each([
    ['draft',     'Borrador'],
    ['published', 'Publicado'],
    ['archived',  'Archivado'],
  ])('maps %s → "%s"', (input, expected) => {
    expect(getStatusLabel(input)).toBe(expected);
  });

  it('returns "Borrador" for falsy input', () => {
    expect(getStatusLabel(null)).toBe('Borrador');
    expect(getStatusLabel('')).toBe('Borrador');
    expect(getStatusLabel(undefined)).toBe('Borrador');
  });

  it('returns the raw value for unknown statuses', () => {
    expect(getStatusLabel('pending_review')).toBe('pending_review');
  });
});
