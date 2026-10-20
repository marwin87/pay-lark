/**
 * Pure unit spec for upcomingPayments (no browser, no stack).
 * Risk: the bill form's live summary shows wrong "next payments", so the user trusts a schedule
 *       that is not what gets generated.
 */
import { test, expect } from '@playwright/test';
import { upcomingPayments } from '../../src/lib/schedule';

const base = { frequency: 'monthly' as const, stepMonths: 1, start: '2026-10', days: [15], dates: [], end: null };

test('monthly: next three payments after today', () => {
  expect(upcomingPayments({ ...base, today: '2026-10-20' })).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
});

test('a payment due today is still upcoming', () => {
  expect(upcomingPayments({ ...base, today: '2026-10-15' })[0]).toBe('2026-10-15');
});

test('several days per month come out in date order', () => {
  expect(upcomingPayments({ ...base, days: [15, 1], today: '2026-10-02' })).toEqual(['2026-10-15', '2026-11-01', '2026-11-15']);
});

test('day 31 falls on the last day of shorter months', () => {
  expect(upcomingPayments({ ...base, start: '2026-01', days: [31], today: '2026-02-01' })).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('every 3 months follows the cycle from the start month', () => {
  expect(upcomingPayments({ ...base, start: '2026-01', stepMonths: 3, days: [5], today: '2026-02-01' })).toEqual(['2026-04-05', '2026-07-05', '2026-10-05']);
});

test('annual: one payment a year', () => {
  expect(upcomingPayments({ ...base, frequency: 'annual', stepMonths: 12, start: '2026-03', days: [10], today: '2026-10-20' })).toEqual(['2027-03-10', '2028-03-10', '2029-03-10']);
});

test('the last payment month ends the list', () => {
  expect(upcomingPayments({ ...base, end: '2026-12', today: '2026-11-20' })).toEqual(['2026-12-15']);
});

test('one-off: only future dates, sorted', () => {
  expect(upcomingPayments({ ...base, frequency: 'one_off', dates: ['2027-02-01', '2026-01-01', '2026-11-05'], today: '2026-10-20' })).toEqual(['2026-11-05', '2027-02-01']);
});

test('no days picked: nothing to show', () => {
  expect(upcomingPayments({ ...base, days: [], today: '2026-10-20' })).toEqual([]);
});
