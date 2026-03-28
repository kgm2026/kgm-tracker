import { describe, it, expect } from 'vitest';
import { fmt, formatDate, parseDate, toFloat, toInt } from './formatting';

describe('fmt', () => {
  it('formats numbers with PKR prefix', () => {
    expect(fmt(1000)).toBe('PKR 1,000');
    expect(fmt(500000)).toBe('PKR 500,000');
  });

  it('handles null/undefined', () => {
    expect(fmt(null)).toBe('PKR 0');
    expect(fmt(undefined)).toBe('PKR 0');
  });
});

describe('toInt/toFloat', () => {
  it('parses numeric strings', () => {
    expect(toInt('123')).toBe(123);
    expect(toFloat('12.5')).toBe(12.5);
  });

  it('falls back to default for invalid/empty values', () => {
    expect(toInt('', 7)).toBe(7);
    expect(toFloat('not-a-number', 3.14)).toBe(3.14);
  });
});

describe('parseDate/formatDate', () => {
  it('parses dd/mm/yyyy strings', () => {
    const d = parseDate('15/03/2024');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2); // March (0-indexed)
    expect(d.getDate()).toBe(15);
  });

  it('formatDate returns ISO yyyy-mm-dd for ISO inputs', () => {
    expect(formatDate('2024-03-15T10:00:00.000Z')).toBe('2024-03-15');
  });

  it('formatDate returns original for dd/mm/yyyy inputs', () => {
    expect(formatDate('15/03/2024')).toBe('15/03/2024');
  });
});

