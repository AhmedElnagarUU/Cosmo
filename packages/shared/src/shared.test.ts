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
