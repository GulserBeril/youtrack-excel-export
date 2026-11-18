import {toQueryDate} from './query';
import type {DateRange} from './types';

export type DatePreset = 'any' | 'last7' | 'last30' | 'thisMonth' | 'thisYear' | 'custom';

export const DATE_PRESETS: Exclude<DatePreset, 'custom'>[] = ['any', 'last7', 'last30', 'thisMonth', 'thisYear'];

/** Inclusive date range for a preset, relative to `today`. */
export function presetRange(preset: DatePreset, today = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  const daysAgo = (n: number) => new Date(y, m, today.getDate() - n);
  switch (preset) {
    case 'last7':
      return {from: toQueryDate(daysAgo(6)), to: toQueryDate(today)};
    case 'last30':
      return {from: toQueryDate(daysAgo(29)), to: toQueryDate(today)};
    case 'thisMonth':
      return {from: toQueryDate(new Date(y, m, 1)), to: toQueryDate(today)};
    case 'thisYear':
      return {from: toQueryDate(new Date(y, 0, 1)), to: toQueryDate(today)};
    default:
      return {};
  }
}

/** Which preset (if any) a stored range corresponds to. */
export function detectPreset(range: DateRange, today = new Date()): DatePreset {
  if (!range.from && !range.to) {
    return 'any';
  }
  for (const preset of DATE_PRESETS) {
    const r = presetRange(preset, today);
    if (r.from === range.from && r.to === range.to) {
      return preset;
    }
  }
  return 'custom';
}

/** Human readable "2026-01-01 – 2026-03-31" style text for custom ranges. */
export function formatRange(range: DateRange): string {
  return `${range.from ?? '…'} – ${range.to ?? '…'}`;
}
