import { describe, expect, it } from 'vitest';
import { campusLabel } from './campus';

describe('campus selector label', () => {
  it('uses the short part of a "Name — Place" campus name', () => {
    expect(campusLabel('Grace East — Botany')).toBe('Botany');
  });
  it('falls back to the full name instead of a blank pill', () => {
    expect(campusLabel('Henderson Campus')).toBe('Henderson Campus');
    expect(campusLabel('Grace West — ')).toBe('Grace West —');
    expect(campusLabel('  ')).toBe('Campus');
  });
});
