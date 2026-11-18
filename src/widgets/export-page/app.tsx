import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {H1, H2} from '@jetbrains/ring-ui-built/components/heading/heading';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Island from '@jetbrains/ring-ui-built/components/island/island';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import type {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import ProgressBar from '@jetbrains/ring-ui-built/components/progress-bar/progress-bar';
import Text from '@jetbrains/ring-ui-built/components/text/text';

import {ColumnPicker} from '../../components/ColumnPicker';
import {filterKindFor} from '../../components/FieldFilterControl';
import {FilterPanel, PINNED_FIELDS, QuickPresets} from '../../components/FilterPanel';
import {PreviewTable} from '../../components/PreviewTable';
import {allColumns, DEFAULT_COLUMN_KEYS} from '../../lib/columns';
import {defaultCsvDelimiter, EXPORT_FORMATS, exportIssues} from '../../lib/exporters';
import type {CsvDelimiter, ExportFormat} from '../../lib/exporters';
import {createTranslator, I18nContext} from '../../lib/i18n';
import type {MessageKey} from '../../lib/i18n';
import {downloadIcon, eyeIcon, fileIcon, filterIcon, issueIcon, newWindowIcon, tableIcon} from '../../lib/icons';
import {buildQuery} from '../../lib/query';
import {EMPTY_FILTERS} from '../../lib/types';
import type {FieldMeta, Filters, Project, RawIssue, SavedQuery} from '../../lib/types';
import {createYouTrackApi} from '../../lib/youtrack';

// Register the widget in YouTrack. See https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();
const api = createYouTrackApi(host);
const t = createTranslator(YTApp.locale);

/** When no project is selected, field metadata is loaded from at most this many projects. */
const MAX_PROJECTS_FOR_FIELDS = 30;
const LARGE_EXPORT_WARNING = 5000;
const PREVIEW_ROWS = 5;
const SECTION_IDS = ['section-issues', 'section-columns', 'section-preview', 'section-export'];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The chosen format is remembered per browser as a convenience. Storage can be blocked
// (private mode, sandboxed iframe), so every access is guarded and falls back to defaults.
const FORMAT_KEY = 'issue-export.format';
const DELIMITER_KEY = 'issue-export.csvDelimiter';
function recall(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore: the choice just won't be remembered
  }
}

const FORMAT_TEXT: Record<ExportFormat, {label: MessageKey; hint: MessageKey; download: MessageKey}> = {
  xlsx: {label: 'export.formatXlsx', hint: 'export.hintXlsx', download: 'export.downloadXlsx'},
  csv: {label: 'export.formatCsv', hint: 'export.hintCsv', download: 'export.downloadCsv'}
};

const defaultFieldFilters = (fields: FieldMeta[]) => PINNED_FIELDS
  .map(name => fields.find(f => f.name === name))
  .filter((f): f is FieldMeta => Boolean(f))
  .map(f => ({field: f.name, kind: filterKindFor(f), values: []}));

type ExportState =
  | {phase: 'idle'}
  | {phase: 'loading'; loaded: number}
  | {phase: 'building'}
  | {phase: 'done'; fileName: string};

interface CardProps {
  id: string;
  icon: string;
  title: string;
  /** Extra content on the title row (quick filters, counters, links). */
  headerExtra?: React.ReactNode;
  /** Content pushed to the right end of the title row. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/** A section on a Ring UI Island (the panel YouTrack itself uses): icon + title row, then content. */
function Card({id, icon, title, headerExtra, aside, children}: CardProps) {
  return (
    <Island id={id} className="card" aria-labelledby={`${id}-title`} role="region">
      <div className="card-header">
        <Icon glyph={icon} className="card-icon"/>
        <H2 id={`${id}-title`}>{title}</H2>
        {headerExtra}
        {aside && <div className="card-aside">{aside}</div>}
      </div>
      {children}
    </Island>
  );
}

const AppComponent: React.FunctionComponent = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [advanced, setAdvanced] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [columnKeys, setColumnKeys] = useState<string[]>([]);

  const [count, setCount] = useState<number | null>(null);
  const [preview, setPreview] = useState<RawIssue[] | null>(null);
  const [checking, setChecking] = useState(true);
  const [exportState, setExportState] = useState<ExportState>({phase: 'idle'});
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>(() => {
    const saved = recall(FORMAT_KEY);
    return EXPORT_FORMATS.includes(saved as ExportFormat) ? saved as ExportFormat : 'xlsx';
  });
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>(() => {
    const saved = recall(DELIMITER_KEY);
    return saved === ';' || saved === ',' ? saved : defaultCsvDelimiter(YTApp.locale);
  });
  const doneTimer = useRef<ReturnType<typeof setTimeout>>();

  // Initial metadata ---------------------------------------------------------
  useEffect(() => {
    Promise.all([
      api.getProjects().then(setProjects),
      api.getTags().then(setTags).catch(() => setTags([])),
      api.getSavedQueries().then(setSavedQueries).catch(() => setSavedQueries([]))
    ]).catch(e => setError(t('error.load', {error: errorText(e)})));
  }, []);

  // Custom fields depend on which projects are selected ----------------------
  useEffect(() => {
    if (!projects.length) {
      return undefined;
    }
    const scope = filters.projects.length
      ? projects.filter(p => filters.projects.includes(p.shortName))
      : projects.slice(0, MAX_PROJECTS_FOR_FIELDS);
    let cancelled = false;
    api.getFieldsForProjects(scope).then(loaded => {
      if (!cancelled) {
        setFields(loaded);
      }
    }).catch(e => setError(t('error.load', {error: errorText(e)})));
    return () => {
      cancelled = true;
    };
  }, [projects, filters.projects]);

  // First time fields arrive: add the pinned filter rows and default columns.
  useEffect(() => {
    if (!fields.length) {
      return;
    }
    setFilters(prev => (prev.fieldFilters.length ? prev : {...prev, fieldFilters: defaultFieldFilters(fields)}));
    setColumnKeys(prev => {
      if (prev.length) {
        return prev;
      }
      const known = new Set(allColumns(fields, t).map(c => c.key));
      return DEFAULT_COLUMN_KEYS.filter(k => known.has(k));
    });
  }, [fields]);

  const columns = useMemo(() => allColumns(fields, t), [fields]);
  const selectedColumns = useMemo(
    () => columnKeys.map(k => columns.find(c => c.key === k)).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [columnKeys, columns]
  );
  const query = advanced ? customQuery : buildQuery(filters);

  // Debounced count + preview rows --------------------------------------------
  useEffect(() => {
    const signal = {cancelled: false};
    setChecking(true);
    const timer = setTimeout(async () => {
      const [c, rows] = await Promise.all([
        api.countIssues(query, signal).catch(() => null),
        api.fetchPreview(query, PREVIEW_ROWS).catch(() => [])
      ]);
      if (!signal.cancelled) {
        setCount(c);
        setPreview(rows);
        setChecking(false);
      }
    }, 450);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const toggleAdvanced = useCallback(() => {
    // Switching to the query editor starts from the query generated by the visual filters.
    if (!advanced) {
      setCustomQuery(buildQuery(filters));
    }
    setAdvanced(!advanced);
  }, [advanced, filters]);

  const loadSavedQuery = useCallback((saved: SavedQuery) => {
    setCustomQuery(saved.query);
    setAdvanced(true);
  }, []);

  const busy = exportState.phase === 'loading' || exportState.phase === 'building';

  const doExport = useCallback(async () => {
    setError(null);
    clearTimeout(doneTimer.current);
    try {
      setExportState({phase: 'loading', loaded: 0});
      const issues = await api.fetchAllIssues(query, loaded => setExportState({phase: 'loading', loaded}));
      setExportState({phase: 'building'});
      const fileName = await exportIssues({format, csvDelimiter, issues, columns: selectedColumns, query, t});
      setExportState({phase: 'done', fileName});
      doneTimer.current = setTimeout(() => setExportState({phase: 'idle'}), 8000);
    } catch (e) {
      setExportState({phase: 'idle'});
      setError(t('export.failed', {error: errorText(e)}));
    }
  }, [query, selectedColumns, format, csvDelimiter]);

  const chooseFormat = useCallback((value: ExportFormat) => {
    setFormat(value);
    remember(FORMAT_KEY, value);
  }, []);
  const chooseDelimiter = useCallback((value: CsvDelimiter) => {
    setCsvDelimiter(value);
    remember(DELIMITER_KEY, value);
  }, []);

  useEffect(() => () => clearTimeout(doneTimer.current), []);

  const reset = useCallback(() => {
    setFilters({...EMPTY_FILTERS, fieldFilters: defaultFieldFilters(fields)});
    setCustomQuery('');
    setAdvanced(false);
    const known = new Set(columns.map(c => c.key));
    setColumnKeys(DEFAULT_COLUMN_KEYS.filter(k => known.has(k)));
    setError(null);
    clearTimeout(doneTimer.current);
    setExportState({phase: 'idle'});
  }, [fields, columns]);

  // --- Export bar texts ---
  let issuesText: React.ReactNode;
  if (checking) {
    issuesText = <><LoaderInline/> {t('export.counting')}</>;
  } else if (count === null) {
    issuesText = <Text className="warning">{t('export.countUnknown')}</Text>;
  } else {
    issuesText = count === 1 ? t('export.countOne') : t('export.count', {count});
  }
  const columnsText = selectedColumns.length === 1
    ? t('export.columnsSelectedOne')
    : t('export.columnsSelected', {count: selectedColumns.length});

  let status: React.ReactNode = null;
  if (exportState.phase === 'loading') {
    status = <Text info>{t('export.loading', {loaded: exportState.loaded, total: count ?? '?'})}</Text>;
  } else if (exportState.phase === 'building') {
    status = <Text info>{t('export.building')}</Text>;
  } else if (exportState.phase === 'done') {
    status = <Text className="success">{'✓ '}{t('export.done', {name: exportState.fileName})}</Text>;
  }

  let blocker: string | null = null;
  if (fields.length && !selectedColumns.length) {
    blocker = t('export.noColumns');
  } else if (count === 0 && !checking) {
    blocker = t('export.noIssues');
  }

  let previewNote: string | null = null;
  if (preview && preview.length && count !== null) {
    previewNote = count > preview.length
      ? t('preview.more', {shown: preview.length, total: count})
      : t('preview.all', {total: count});
  }

  const stateKeys = useMemo(
    () => new Set(fields.filter(f => f.valueType === 'state').map(f => `cf:${f.name}`)),
    [fields]
  );

  const formatItems = EXPORT_FORMATS.map(f => ({key: f, label: t(FORMAT_TEXT[f].label), value: f}));
  const delimiterItems: {key: CsvDelimiter; label: string; value: CsvDelimiter}[] = [
    {key: ';', label: t('export.delimiterSemicolon'), value: ';'},
    {key: ',', label: t('export.delimiterComma'), value: ','}
  ];

  return (
    <I18nContext.Provider value={t}>
      <div className="app">
        <header className="page-header">
          <H1>{t('app.heroTitle')}</H1>
          <Text info>{t('app.subtitle')}</Text>
        </header>

        <Card
          id={SECTION_IDS[0]}
          icon={filterIcon}
          title={t('b.filtersTitle')}
          headerExtra={!advanced && <QuickPresets fields={fields} filters={filters} onChange={setFilters}/>}
          aside={(
            <Button inline iconRight={advanced ? undefined : newWindowIcon} onClick={toggleAdvanced}>
              {advanced ? t('filter.visual') : t('filter.advanced')}
            </Button>
          )}
        >
          {advanced
            ? (
              <div className="advanced">
                <Input
                  multiline
                  size={Size.FULL}
                  label={t('filter.queryLabel')}
                  value={customQuery}
                  onChange={e => setCustomQuery(e.target.value)}
                  placeholder="project: ABC #Unresolved"
                />
                <Text info>{t('filter.queryHint')}</Text>
              </div>
            )
            : (
              <FilterPanel
                api={api}
                projects={projects}
                fields={fields}
                tags={tags}
                savedQueries={savedQueries}
                filters={filters}
                onChange={setFilters}
                onSavedQuery={loadSavedQuery}
              />
            )}
        </Card>

        <div className="two-col">
          <Card
            id={SECTION_IDS[1]}
            icon={tableIcon}
            title={t('b.columnsTitle')}
            aside={<Text info>{t('columns.selectedShort', {count: selectedColumns.length})}</Text>}
          >
            <ColumnPicker available={columns} selected={columnKeys} onChange={setColumnKeys}/>
          </Card>
          <Card
            id={SECTION_IDS[2]}
            icon={eyeIcon}
            title={t('b.previewTitle')}
            aside={previewNote && <Text info>{previewNote}</Text>}
          >
            <PreviewTable issues={preview} columns={selectedColumns} stateKeys={stateKeys} loading={checking}/>
          </Card>
        </div>

        {error && <Banner mode="error" withIcon>{error}</Banner>}

        <Island id={SECTION_IDS[3]} className="card export-bar" role="region" aria-label={t('export.summary')}>
          <div className="export-row">
            <div className="export-facts" aria-live="polite">
              <span className="export-fact export-fact--strong">
                <Icon glyph={issueIcon} className="muted-icon"/>
                {issuesText}
              </span>
              <span className="export-fact">
                <Icon glyph={tableIcon} className="muted-icon"/>
                <Text info>{columnsText}</Text>
              </span>
              <span className="export-fact">
                <Icon glyph={fileIcon} className="muted-icon"/>
                <Text info>{t('export.formatColon')}</Text>
                <Select<{value: ExportFormat}>
                  size={Size.AUTO}
                  data={formatItems}
                  selected={formatItems.find(i => i.value === format)}
                  onChange={(item: SelectItem<{value: ExportFormat}> | null) => item && chooseFormat(item.value)}
                  aria-label={t('export.format')}
                />
                {format === 'csv' && (
                  <>
                    <Text info>{t('export.separatorColon')}</Text>
                    <Select<{value: CsvDelimiter}>
                      size={Size.AUTO}
                      data={delimiterItems}
                      selected={delimiterItems.find(i => i.value === csvDelimiter)}
                      onChange={(item: SelectItem<{value: CsvDelimiter}> | null) => item && chooseDelimiter(item.value)}
                      aria-label={t('export.delimiter')}
                    />
                  </>
                )}
              </span>
            </div>
            <div className="export-actions">
              <Button onClick={reset} disabled={busy}>{t('export.reset')}</Button>
              <Button primary inline={false} icon={downloadIcon} onClick={doExport} disabled={busy || Boolean(blocker) || checking} loader={busy}>
                {t(format === 'csv' ? 'export.exportCsv' : 'export.exportXlsx')}
              </Button>
            </div>
          </div>
          {(status || blocker || (count !== null && count > LARGE_EXPORT_WARNING) || exportState.phase === 'loading') && (
            <div className="export-note" aria-live="polite">
              {status ?? (blocker
                ? <Text className="warning">{blocker}</Text>
                : <Text className="warning" size={Text.Size.S}>{t('export.large')}</Text>)}
              {exportState.phase === 'loading' && count
                ? <ProgressBar className="progress" value={exportState.loaded} max={count} label={t('export.loading', {loaded: exportState.loaded, total: count})}/>
                : null}
            </div>
          )}
          {format === 'csv' && !status && !blocker && (
            <Text info size={Text.Size.S} className="export-hint">{t(FORMAT_TEXT.csv.hint)}</Text>
          )}
        </Island>
      </div>
    </I18nContext.Provider>
  );
};

export const App = memo(AppComponent);
