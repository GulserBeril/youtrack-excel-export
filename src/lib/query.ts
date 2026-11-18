import type {DateRange, FieldFilter, Filters} from './types';

/**
 * Wraps a field name or value in braces when it contains characters that the
 * YouTrack query language would otherwise interpret (spaces, commas, colons, ...).
 */
export function quote(value: string): string {
  const v = value.trim();
  if (v === '') {
    return v;
  }
  return /[\s,:{}()#"-]/.test(v) ? `{${v.replace(/[{}]/g, '')}}` : v;
}

function range(attr: string, r: DateRange | {from?: string; to?: string}): string | null {
  const from = r.from?.trim();
  const to = r.to?.trim();
  if (!from && !to) {
    return null;
  }
  // "*" marks an open end of the range.
  return `${attr}: ${from || '*'} .. ${to || '*'}`;
}

function fieldFilterToQuery(f: FieldFilter): string | null {
  const name = quote(f.field);
  switch (f.kind) {
    case 'values':
    case 'users':
      // Comma separated values of the same field are OR-ed.
      return f.values.length ? `${name}: ${f.values.map(quote).join(', ')}` : null;
    case 'range':
      return range(name, f);
    case 'text':
      return f.text?.trim() ? `${name}: ${quote(f.text)}` : null;
    default:
      return null;
  }
}

/**
 * Converts the visual filter model to a YouTrack search query.
 * Different attributes are AND-ed by YouTrack when separated by spaces.
 *
 * Example: `project: ABC, WEB State: Open, {In Progress} created: 2026-01-01 .. 2026-03-31 #Unresolved`
 */
export function buildQuery(filters: Filters): string {
  const parts: string[] = [];

  if (filters.projects.length) {
    parts.push(`project: ${filters.projects.map(quote).join(', ')}`);
  }
  if (filters.resolved === 'unresolved') {
    parts.push('#Unresolved');
  } else if (filters.resolved === 'resolved') {
    parts.push('#Resolved');
  }

  for (const f of filters.fieldFilters) {
    const q = fieldFilterToQuery(f);
    if (q) {
      parts.push(q);
    }
  }

  const created = range('created', filters.created);
  if (created) {
    parts.push(created);
  }
  const updated = range('updated', filters.updated);
  if (updated) {
    parts.push(updated);
  }

  for (const tag of filters.tags) {
    parts.push(`tag: ${quote(tag)}`);
  }

  if (filters.text.trim()) {
    parts.push(filters.text.trim());
  }

  return parts.join(' ');
}

/** Formats a Date as YYYY-MM-DD in local time, the format YouTrack expects in queries. */
export function toQueryDate(date: Date | null | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses YYYY-MM-DD back into a local Date (for DatePicker values). */
export function fromQueryDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
