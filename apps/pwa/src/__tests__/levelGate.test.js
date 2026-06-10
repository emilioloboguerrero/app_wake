import { describe, it, expect } from 'vitest';
import { effectiveLevel, shouldAskLevel } from '../utils/levelGate';

// ─── shouldAskLevel ───────────────────────────────────────────────────────────

describe('shouldAskLevel', () => {
  it('returns true when course is leveled and entry has no level', () => {
    const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
    expect(shouldAskLevel(course, {})).toBe(true);
  });

  it('returns true when course is leveled and entry is null', () => {
    const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
    expect(shouldAskLevel(course, null)).toBe(true);
  });

  it('returns true when course is leveled and entry level is not in options', () => {
    const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
    expect(shouldAskLevel(course, { level: 'intermedio' })).toBe(true);
  });

  it('returns false once a valid level is set', () => {
    const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
    expect(shouldAskLevel(course, { level: 'avanzado' })).toBe(false);
  });

  it('returns false for a non-leveled course (no levels field)', () => {
    const course = { title: 'Método Bejarano' };
    expect(shouldAskLevel(course, {})).toBe(false);
  });

  it('returns false for a non-leveled course (empty options array)', () => {
    const course = { levels: { options: [] } };
    expect(shouldAskLevel(course, {})).toBe(false);
  });

  it('returns false when course is null', () => {
    expect(shouldAskLevel(null, {})).toBe(false);
  });
});

// ─── effectiveLevel ───────────────────────────────────────────────────────────

describe('effectiveLevel', () => {
  it('returns the chosen level when it is in options', () => {
    const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
    expect(effectiveLevel(course, { level: 'avanzado' })).toBe('avanzado');
  });

  it('falls back to course default when entry has no valid level', () => {
    const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
    expect(effectiveLevel(course, {})).toBe('principiante');
  });

  it('falls back to course default when entry is null', () => {
    const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
    expect(effectiveLevel(course, null)).toBe('principiante');
  });

  it('falls back to course default when level is not in options', () => {
    const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
    expect(effectiveLevel(course, { level: 'intermedio' })).toBe('principiante');
  });

  it('returns null when course has no levels', () => {
    const course = { title: 'Método Bejarano' };
    expect(effectiveLevel(course, { level: 'avanzado' })).toBeNull();
  });

  it('returns null when course has empty options', () => {
    const course = { levels: { options: [] } };
    expect(effectiveLevel(course, { level: 'avanzado' })).toBeNull();
  });

  it('returns null when course is null', () => {
    expect(effectiveLevel(null, { level: 'avanzado' })).toBeNull();
  });
});
