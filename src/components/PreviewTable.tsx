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

import React from 'react';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';

import {cellColor, cellValue} from '../lib/columns';
import {useT} from '../lib/i18n';
import type {ColumnDef, RawIssue} from '../lib/types';

interface Props {
  issues: RawIssue[] | null;
  columns: ColumnDef[];
  /** Column keys of state fields (shown as tags, like in YouTrack). */
  stateKeys: Set<string>;
  loading: boolean;
}

function display(value: string | number | Date | null, type: ColumnDef['type']): string {
  if (value === null || value === '') {
    return '—';
  }
  if (value instanceof Date) {
    return type === 'date' ? value.toLocaleDateString() : value.toISOString();
  }
  return String(value);
}

/**
 * One cell. Colors only ever come from YouTrack's own field-value colors in the issue data
 * (the same colors YouTrack shows for that value), never from a palette of ours.
 */
function Cell({issue, column, isState}: {issue: RawIssue; column: ColumnDef; isState: boolean}) {
  const text = display(cellValue(issue, column), column.type);
  if (text === '—') {
    return <span className="muted">{text}</span>;
  }
  if (column.key === 'idReadable') {
    return <span className="issue-id">{text}</span>;
  }
  const color = cellColor(issue, column);
  if (isState) {
    return (
      <Tag readOnly backgroundColor={color?.background} textColor={color?.foreground}>
        {text}
      </Tag>
    );
  }
  if (color) {
    return (
      <span className="cell-with-dot">
        <span className="value-dot" style={{background: color.background}} aria-hidden/>
        {text}
      </span>
    );
  }
  return <>{text}</>;
}

/** Shows the first rows exactly as they will appear in the exported file. */
export function PreviewTable({issues, columns, stateKeys, loading}: Props) {
  const t = useT();

  if (!columns.length) {
    return <div className="empty-hint">{t('columns.empty')}</div>;
  }
  if (issues === null || (loading && !issues.length)) {
    return <div className="empty-hint"><LoaderInline/> {t('preview.loading')}</div>;
  }
  if (!issues.length) {
    return <div className="empty-hint">{t('preview.empty')}</div>;
  }

  return (
    <div className={loading ? 'preview preview--loading' : 'preview'}>
      <div className="preview-scroll">
        <table className="preview-table">
          <thead>
            <tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {issues.map(issue => (
              <tr key={issue.idReadable}>
                {columns.map(c => (
                  <td key={c.key} title={display(cellValue(issue, c), c.type)} className={c.type === 'number' ? 'num' : undefined}>
                    <Cell issue={issue} column={c} isState={stateKeys.has(c.key)}/>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
