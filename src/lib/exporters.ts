import {cellValue} from './columns';
import {exportFileName} from './fileName';
import type {Translate} from './i18n';
import type {ColumnDef, RawIssue} from './types';

export type ExportFormat = 'xlsx' | 'csv';
export type CsvDelimiter = ';' | ',';

export const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'csv'];

const MIME: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8'
};

/** Excel needs this byte order mark to read UTF-8 (ş, ğ, ı, ...) correctly. */
const UTF8_BOM = '﻿';

/** Turkish Excel expects ";" between CSV fields (comma is the decimal separator there). */
export function defaultCsvDelimiter(locale: string | undefined): CsvDelimiter {
  return locale?.toLowerCase().startsWith('tr') ? ';' : ',';
}

type Cell = string | number | Date | null;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local "YYYY-MM-DD HH:mm" (what people expect to see in a spreadsheet cell). */
export function formatDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toText(value: Cell): string {
  if (value === null) {
    return '';
  }
  return value instanceof Date ? formatDateTime(value) : String(value);
}

// --- CSV -----------------------------------------------------------------------

/**
 * Text starting with = + - @ (or a tab/CR) is run as a formula by spreadsheet apps
 * ("CSV injection"). Such values are prefixed with an apostrophe so they stay plain text.
 */
function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvField(value: Cell, delimiter: CsvDelimiter): string {
  const text = typeof value === 'string' ? neutralizeFormula(value) : toText(value);
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(issues: RawIssue[], columns: ColumnDef[], delimiter: CsvDelimiter): string {
  const lines = [columns.map(c => csvField(c.label, delimiter)).join(delimiter)];
  for (const issue of issues) {
    lines.push(columns.map(c => csvField(cellValue(issue, c), delimiter)).join(delimiter));
  }
  // CRLF line endings are what Excel and RFC 4180 expect.
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

// --- Download ---------------------------------------------------------------------

function download(content: BlobPart, format: ExportFormat, name: string) {
  const url = URL.createObjectURL(new Blob([content], {type: MIME[format]}));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export interface ExportOptions {
  format: ExportFormat;
  csvDelimiter: CsvDelimiter;
  issues: RawIssue[];
  columns: ColumnDef[];
  query: string;
  t: Translate;
}

/** Builds the file in the chosen format, downloads it and returns its name. */
export async function exportIssues({format, csvDelimiter, issues, columns, query, t}: ExportOptions): Promise<string> {
  let content: BlobPart;
  if (format === 'csv') {
    content = buildCsv(issues, columns, csvDelimiter);
  } else {
    const {buildXlsx} = await import('./excel');
    content = await buildXlsx({issues, columns, query, t});
  }
  const name = exportFileName(issues, format);
  download(content, format, name);
  return name;
}
