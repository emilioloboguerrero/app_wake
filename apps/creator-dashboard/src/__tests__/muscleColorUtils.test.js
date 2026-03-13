import { describe, it, expect } from 'vitest';
import { getMuscleColor, getMuscleSelectionColor } from '../utils/muscleColorUtils';

// ============ getMuscleColor ============

describe('getMuscleColor', () => {
  it('returns barely-visible white for 0 sets', () => {
    expect(getMuscleColor(0)).toEqual({ color: '#FFFFFF', opacity: 0.1 });
  });

  it('returns low-opacity white for 1 set', () => {
    const { color, opacity } = getMuscleColor(1);
    expect(color).toBe('#FFFFFF');
    expect(opacity).toBeGreaterThan(0.1);
    expect(opacity).toBeLessThan(0.7);
  });

  it('returns increasing opacity from 1 to 6 sets', () => {
    const opacities = [1, 2, 3, 4, 5, 6].map(n => getMuscleColor(n).opacity);
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeGreaterThan(opacities[i - 1]);
    }
  });

  it('opacity stays at 0.7 at the 6-set ceiling', () => {
    expect(getMuscleColor(6).opacity).toBeCloseTo(0.7, 5);
  });

  it('returns fixed opacity for mid-range sets (7–18)', () => {
    for (const n of [7, 10, 15, 18]) {
      expect(getMuscleColor(n).opacity).toBe(0.6);
    }
  });

  it('returns dark red for 19+ sets', () => {
    expect(getMuscleColor(19)).toEqual({ color: '#8B0000', opacity: 0.8 });
    expect(getMuscleColor(100)).toEqual({ color: '#8B0000', opacity: 0.8 });
  });

  it('covers the exact boundary between ranges', () => {
    // 6 → white range, 7 → mid range
    expect(getMuscleColor(6).opacity).not.toBe(getMuscleColor(7).opacity);
    // 18 → mid range, 19 → dark red
    expect(getMuscleColor(18).color).not.toBe(getMuscleColor(19).color);
  });
});

// ============ getMuscleSelectionColor ============

describe('getMuscleSelectionColor', () => {
  it('returns the correct value when selected', () => {
    expect(getMuscleSelectionColor(true)).toEqual({ color: '#ffffff', opacity: 0.2 });
  });

  it('returns the correct value when not selected', () => {
    expect(getMuscleSelectionColor(false)).toEqual({ color: '#FFFFFF', opacity: 0.1 });
  });

  it('selected has higher opacity than unselected', () => {
    expect(getMuscleSelectionColor(true).opacity).toBeGreaterThan(
      getMuscleSelectionColor(false).opacity
    );
  });
});
