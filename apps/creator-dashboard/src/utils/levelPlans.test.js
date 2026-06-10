import { describe, it, expect } from 'vitest';
import { buildLevelConfig, isLevelConfigComplete } from './levelPlans';

describe('buildLevelConfig', () => {
  it('builds { levels, level_plans } from a mapping', () => {
    const out = buildLevelConfig(
      ['principiante', 'intermedio', 'avanzado'],
      'principiante',
      { principiante: 'p1', intermedio: 'p2', avanzado: 'p3' }
    );
    expect(out).toEqual({
      levels: { options: ['principiante', 'intermedio', 'avanzado'], default: 'principiante' },
      level_plans: { principiante: 'p1', intermedio: 'p2', avanzado: 'p3' },
    });
  });
  it('omits levels with no plan selected', () => {
    const out = buildLevelConfig(['principiante', 'avanzado'], 'principiante', { principiante: 'p1', avanzado: '' });
    expect(out.level_plans).toEqual({ principiante: 'p1' });
  });
});

describe('isLevelConfigComplete', () => {
  it('true when every option maps to a plan', () => {
    expect(isLevelConfigComplete(['a', 'b'], { a: 'p1', b: 'p2' })).toBe(true);
  });
  it('false when an option is unmapped', () => {
    expect(isLevelConfigComplete(['a', 'b'], { a: 'p1', b: '' })).toBe(false);
  });
});
