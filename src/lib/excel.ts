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

import {cellValue} from './columns';
import {projectNames} from './fileName';
import type {Translate} from './i18n';
import type {ColumnDef, RawIssue} from './types';

/** Excel limits a single cell to 32,767 characters. */
const MAX_CELL_LENGTH = 32767;

function clamp(value: string | number | Date | null) {
  if (typeof value === 'string' && value.length > MAX_CELL_LENGTH) {
    return `${value.slice(0, MAX_CELL_LENGTH - 3)}...`;
  }
  return value;
}

export interface XlsxOptions {
  issues: RawIssue[];
  columns: ColumnDef[];
  query: string;
  t: Translate;
}

/**
 * Builds a formatted .xlsx workbook in the browser.
 * ExcelJS is loaded lazily so it does not slow down the initial page load.
 */
export async function buildXlsx({issues, columns, query, t}: XlsxOptions): Promise<ArrayBuffer> {
  const {default: ExcelJS} = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'YouTrack Issue Export';
  wb.created = new Date();

  // --- Issues sheet ---------------------------------------------------------
  const ws = wb.addWorksheet(t('sheet.issues'));
  ws.columns = columns.map(c => ({header: c.label, key: c.key, width: c.width ?? 20}));

  for (const issue of issues) {
    const row: Record<string, unknown> = {};
    for (const c of columns) {
      row[c.key] = clamp(cellValue(issue, c));
    }
    ws.addRow(row);
  }

  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.type === 'date') {
      col.numFmt = 'yyyy-mm-dd hh:mm';
    }
    col.alignment = {vertical: 'top', wrapText: c.key === 'summary' || c.key === 'description'};
  });

  const header = ws.getRow(1);
  header.font = {bold: true, color: {argb: 'FFFFFFFF'}};
  header.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF4A5568'}};
  header.alignment = {vertical: 'middle'};
  ws.views = [{state: 'frozen', ySplit: 1}];
  if (columns.length) {
    ws.autoFilter = {from: {row: 1, column: 1}, to: {row: 1, column: columns.length}};
  }

  // --- Info sheet -----------------------------------------------------------
  const info = wb.addWorksheet(t('sheet.info'));
  info.columns = [{width: 22}, {width: 80}];
  info.addRows([
    [t('sheet.projects'), projectNames(issues).join(', ')],
    [t('sheet.query'), query || t('sheet.allIssues')],
    [t('sheet.exportedAt'), new Date()],
    [t('sheet.count'), issues.length]
  ]);
  info.getColumn(1).font = {bold: true};
  info.getCell('B3').numFmt = 'yyyy-mm-dd hh:mm';

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
