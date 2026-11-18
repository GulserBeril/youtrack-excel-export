import React from 'react';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';

import {cellValue} from '../lib/columns';
import {useT} from '../lib/i18n';
import type {ColumnDef, RawIssue} from '../lib/types';

interface Props {
  issues: RawIssue[] | null;
  columns: ColumnDef[];
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

/** Shows the first rows exactly as they will appear in the Excel file. */
export function PreviewTable({issues, columns, loading}: Props) {
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
                {columns.map(c => {
                  const text = display(cellValue(issue, c), c.type);
                  return (
                    <td key={c.key} title={text} className={c.type === 'number' ? 'num' : undefined}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
