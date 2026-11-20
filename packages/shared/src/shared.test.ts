import { describe, expect, it } from 'vitest';
import { normalizePhone, maskPhone } from './phone';
import { openStatus } from './working-hours';
import { workingHoursSchema, updateSettingsSchema } from './schemas';

describe('normalizePhone', () => {
  it('accepts common Egyptian forms', () => {
    expect(normalizePhone('01012345678')).toBe('01012345678');
    expect(normalizePhone('+20 101 234 5678')).toBe('01012345678');
    expect(normalizePhone('00201012345678')).toBe('01012345678');
    expect(normalizePhone('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678');
  });
  it('refuses wrong numbers', () => {
    expect(normalizePhone('0101234567')).toBeNull();
    expect(normalizePhone('01312345678')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });
  it('masks for logs', () => {
    expect(maskPhone('01012345678')).toBe('010****5678');
  });
});

describe('openStatus', () => {
  const days = [
    { dayOfWeek: 0, opensAt: '09:00', closesAt: '17:00' },
    { dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' },
  ];
  // 2026-11-15 is a Sunday
  it('is open inside the hours', () => {
    expect(openStatus({ date: '2026-11-15', dayOfWeek: 0, time: '10:00' }, days, new Set())).toEqual({
      open: true,
      closesAt: '17:00',
    });
  });
  it('before opening shows today', () => {
    expect(openStatus({ date: '2026-11-15', dayOfWeek: 0, time: '08:00' }, days, new Set())).toEqual({
      open: false,
      nextOpening: { date: '2026-11-15', time: '09:00' },
    });
  });
  it('after closing shows the next open day', () => {
    expect(openStatus({ date: '2026-11-15', dayOfWeek: 0, time: '18:00' }, days, new Set())).toEqual({
      open: false,
      nextOpening: { date: '2026-11-16', time: '09:00' },
    });
  });
  it('a closed day is skipped', () => {
    expect(
      openStatus({ date: '2026-11-15', dayOfWeek: 0, time: '10:00' }, days, new Set(['2026-11-15'])),
    ).toEqual({ open: false, nextOpening: { date: '2026-11-16', time: '09:00' } });
  });
  it('no schedule means no next opening', () => {
    expect(openStatus({ date: '2026-11-15', dayOfWeek: 0, time: '10:00' }, [], new Set())).toEqual({
      open: false,
      nextOpening: null,
    });
  });
});

describe('schemas', () => {
  it('refuses a repeated day and closing before opening', () => {
    expect(
      workingHoursSchema.safeParse({
        days: [
          { dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' },
          { dayOfWeek: 1, opensAt: '10:00', closesAt: '12:00' },
        ],
      }).success,
    ).toBe(false);
    expect(
      workingHoursSchema.safeParse({ days: [{ dayOfWeek: 1, opensAt: '17:00', closesAt: '09:00' }] })
        .success,
    ).toBe(false);
  });
  it('refuses empty settings and bad money', () => {
    expect(updateSettingsSchema.safeParse({}).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ minimumOrderValue: '12.345' }).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ minimumOrderValue: '500.50' }).success).toBe(true);
  });
});

import { applyDiscount, bonusUnits, fromPiasters, toPiasters } from './money';
describe('money', () => {
  it('converts exactly', () => {
    expect(toPiasters('125.5')).toBe(12550);
    expect(toPiasters('0.1') + toPiasters('0.2')).toBe(30);
    expect(fromPiasters(30)).toBe('0.30');
  });
  it('applies a discount and bonus units', () => {
    expect(applyDiscount('100.00', '5')).toBe('95.00');
    expect(applyDiscount('33.33', '10')).toBe('30.00');
    expect(bonusUnits(25, 10, 1)).toBe(2);
    expect(bonusUnits(9, 10, 1)).toBe(0);
  });
});

import { workingMinutesBetween } from './working-hours';
describe('workingMinutesBetween (C-35)', () => {
  const days = [0, 1, 2, 3, 4].map((d) => ({ dayOfWeek: d, opensAt: '09:00', closesAt: '17:00' })); // Sun-Thu
  it('counts only open hours', () => {
    // Sunday 16:00 to Monday 12:00 = 1h + 3h
    expect(workingMinutesBetween({ date: '2026-11-15', dayOfWeek: 0, time: '16:00' }, { date: '2026-11-16', dayOfWeek: 1, time: '12:00' }, days, new Set())).toBe(240);
  });
  it('a night order counts from opening', () => {
    expect(workingMinutesBetween({ date: '2026-11-15', dayOfWeek: 0, time: '22:00' }, { date: '2026-11-16', dayOfWeek: 1, time: '10:30' }, days, new Set())).toBe(90);
  });
  it('skips the weekend and closed days', () => {
    // Thursday 16:00 to Sunday 10:00, with Sunday closed: 60 minutes only
    expect(workingMinutesBetween({ date: '2026-11-19', dayOfWeek: 4, time: '16:00' }, { date: '2026-11-22', dayOfWeek: 0, time: '10:00' }, days, new Set(['2026-11-22']))).toBe(60);
  });
});
