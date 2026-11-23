/*
 * Copyright 2026 Codeo
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {MessageKey, Translate} from './i18n';
import type {ColumnDef, FieldMeta, RawCustomField, RawIssue} from './types';

type BuiltIn = Omit<ColumnDef, 'label'>;

const BUILT_IN: BuiltIn[] = [
  {key: 'idReadable', type: 'text', width: 12},
  {key: 'summary', type: 'text', width: 50},
  {key: 'project', type: 'text', width: 18},
  {key: 'reporter', type: 'text', width: 20},
  {key: 'created', type: 'date', width: 18},
  {key: 'updated', type: 'date', width: 18},
  {key: 'resolved', type: 'date', width: 18},
  {key: 'tags', type: 'text', width: 20},
  {key: 'description', type: 'text', width: 60}
];

/** Column presets offered in the column picker. Keys missing in a project are skipped. */
export const BASIC_COLUMN_KEYS = ['idReadable', 'summary', 'cf:State', 'cf:Assignee', 'cf:Priority', 'created'];
export const DEFAULT_COLUMN_KEYS = BASIC_COLUMN_KEYS;

const NUMERIC_TYPES = new Set(['integer', 'float']);
const DATE_TYPES = new Set(['date', 'date and time']);

export function customFieldColumn(field: FieldMeta): ColumnDef {
  let type: ColumnDef['type'] = 'text';
  if (DATE_TYPES.has(field.valueType)) {
    type = 'date';
  } else if (NUMERIC_TYPES.has(field.valueType)) {
    type = 'number';
  }
  return {key: `cf:${field.name}`, label: field.name, type, width: type === 'text' ? 20 : 16};
}

export function builtInColumns(t: Translate): ColumnDef[] {
  return BUILT_IN.map(c => ({...c, label: t(`col.${c.key}` as MessageKey)}));
}

export function allColumns(fields: FieldMeta[], t: Translate): ColumnDef[] {
  return [...builtInColumns(t), ...fields.map(customFieldColumn)];
}

/** Turns a single custom field value object into readable text. */
function valueToText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  const v = value as Record<string, unknown>;
  // Users have fullName, periods have presentation, text fields have text, the rest have name.
  return String(v.fullName ?? v.name ?? v.presentation ?? v.text ?? v.login ?? '');
}

function customFieldValue(cf: RawCustomField | undefined, column: ColumnDef): string | number | Date | null {
  if (!cf || cf.value === null || cf.value === undefined) {
    return null;
  }
  if (Array.isArray(cf.value)) {
    return cf.value.map(valueToText).filter(Boolean).join(', ');
  }
  if (typeof cf.value === 'number') {
    return column.type === 'date' ? new Date(cf.value) : cf.value;
  }
  return valueToText(cf.value);
}

/** Extracts the cell value for a column from a raw issue. */
export function cellValue(issue: RawIssue, column: ColumnDef): string | number | Date | null {
  if (column.key.startsWith('cf:')) {
    const name = column.key.slice(3);
    return customFieldValue(issue.customFields?.find(cf => cf.name === name), column);
  }
  switch (column.key) {
    case 'idReadable':
      return issue.idReadable;
    case 'summary':
      return issue.summary ?? '';
    case 'description':
      return issue.description ?? '';
    case 'project':
      return issue.project?.name ?? '';
    case 'reporter':
      return issue.reporter?.fullName ?? issue.reporter?.login ?? '';
    case 'created':
    case 'updated':
    case 'resolved': {
      const ts = issue[column.key];
      return typeof ts === 'number' ? new Date(ts) : null;
    }
    case 'tags':
      return (issue.tags ?? []).map(t => t.name).join(', ');
    default:
      return null;
  }
}


/** YouTrack's own colors for a single enum/state value (from the issue data, not our palette). */
export interface ValueColor {
  background: string;
  foreground?: string;
}

export function cellColor(issue: RawIssue, column: ColumnDef): ValueColor | null {
  if (!column.key.startsWith('cf:')) {
    return null;
  }
  const cf = issue.customFields?.find(f => f.name === column.key.slice(3));
  const value = cf?.value as {color?: {background?: string; foreground?: string}} | null | undefined;
  const color = value && !Array.isArray(value) ? value.color : undefined;
  return color?.background ? {background: color.background, foreground: color.foreground} : null;
}
