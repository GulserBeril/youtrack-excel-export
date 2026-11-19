import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {H1, H2, H3} from '@jetbrains/ring-ui-built/components/heading/heading';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Island from '@jetbrains/ring-ui-built/components/island/island';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import type {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import ProgressBar from '@jetbrains/ring-ui-built/components/progress-bar/progress-bar';
import Text from '@jetbrains/ring-ui-built/components/text/text';

import {ColumnList} from '../../components/ColumnList';
import {chipsToQuery, FilterBar} from '../../components/FilterBar';
import type {FilterChip} from '../../components/FilterBar';
import {filterKindFor} from '../../components/FieldFilterControl';
import {PINNED_FIELDS, ProjectSelect} from '../../components/FilterPanel';
import {PreviewTable} from '../../components/PreviewTable';
import {Segmented} from '../../components/Segmented';
import {allColumns, DEFAULT_COLUMN_KEYS} from '../../lib/columns';
import {defaultCsvDelimiter, EXPORT_FORMATS, exportIssues} from '../../lib/exporters';
import type {CsvDelimiter, ExportFormat} from '../../lib/exporters';
import {createTranslator, I18nContext} from '../../lib/i18n';
import type {MessageKey} from '../../lib/i18n';
import {downloadIcon} from '../../lib/icons';
import {buildQuery} from '../../lib/query';
import {EMPTY_FILTERS} from '../../lib/types';
import type {FieldFilter, FieldMeta, Filters, Project, RawIssue} from '../../lib/types';
import {createYouTrackApi} from '../../lib/youtrack';

// Register the widget in YouTrack. See https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();
const api = createYouTrackApi(host);
const t = createTranslator(YTApp.locale);

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

const defaultFieldFilters = (fields: FieldMeta[]): FieldFilter[] => PINNED_FIELDS
  .map(name => fields.find(f => f.name === name))
  .filter((f): f is FieldMeta => Boolean(f))
  .map(f => ({field: f.name, kind: filterKindFor(f), values: []}));

/**
 * Fits the field filters to a (new) project's fields: filters on fields the project doesn't have
 * are dropped, values the project doesn't have are removed, and the pinned filters
 * (State, Assignee) are added when the project has those fields.
 */
function adaptFieldFilters(current: FieldFilter[], fields: FieldMeta[]): FieldFilter[] {
  const kept = current.flatMap((ff): FieldFilter[] => {
    const meta = fields.find(f => f.name === ff.field);
    if (!meta || filterKindFor(meta) !== ff.kind) {
      return [];
    }
    if (ff.kind === 'values') {
      return [{...ff, values: ff.values.filter(v => meta.values.includes(v))}];
    }
    if (ff.kind === 'users' && meta.users) {
      const logins = new Set(meta.users.map(u => u.login));
      return [{...ff, values: ff.values.filter(v => v === 'me' || logins.has(v))}];
    }
    return [ff];
  });
  const missingPinned = defaultFieldFilters(fields).filter(d => !kept.some(k => k.field === d.field));
  return [...missingPinned, ...kept];
}

type ExportState =
  | {phase: 'idle'}
  | {phase: 'loading'; loaded: number}
  | {phase: 'building'}
  | {phase: 'done'; fileName: string};

/**
 * Props for an inactive step. `inert` takes the section out of mouse, keyboard and screen-reader
 * interaction (React 18 has no typed prop for it, so it is passed as a plain attribute).
 */
export function inactiveProps(disabled: boolean | undefined): Record<string, string> {
  return disabled ? {'inert': '', 'aria-disabled': 'true'} : {};
}

const AppComponent: React.FunctionComponent = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [fields, setFields] = useState<FieldMeta[]>([]);

  // Filtering works like YouTrack's issue-list search bar: the selected project, then
  // "Field is value, value" chips and free text. Every change applies at once.
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [searchText, setSearchText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
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
    api.getProjects().then(setProjects).catch(e => setError(t('error.load', {error: errorText(e)})));
    api.getTags().then(setTags).catch(() => setTags([]));
  }, []);

  // Fields (and with them the filters and columns) always belong to the selected project ----
  const selectedProject = filters.projects[0];

  // A different project starts fresh: every other filter (status, quick filters, field filters,
  // dates, tags, text and the query editor) and the column selection go back to their defaults.
  // This runs for every way of changing the project (filter grid, query-editor select, removing
  // the project chip). The default columns are filled in when the new project's fields arrive.
  const previousProject = useRef(selectedProject);
  useEffect(() => {
    if (previousProject.current === selectedProject) {
      return;
    }
    previousProject.current = selectedProject;
    setFilters({...EMPTY_FILTERS, projects: selectedProject ? [selectedProject] : []});
    setChips([]);
    setSearchText('');
    setColumnKeys([]);
  }, [selectedProject]);

  useEffect(() => {
    const project = projects.find(p => p.shortName === selectedProject);
    if (!project) {
      setFields([]);
      return undefined;
    }
    let cancelled = false;
    api.getFieldsForProject(project).then(loaded => {
      if (!cancelled) {
        setFields(loaded);
      }
    }).catch(e => setError(t('error.load', {error: errorText(e)})));
    return () => {
      cancelled = true;
    };
  }, [projects, selectedProject]);

  // When a project's fields arrive: keep only the filters and columns that exist in this project.
  useEffect(() => {
    if (!fields.length) {
      return;
    }
    setFilters(prev => ({...prev, fieldFilters: adaptFieldFilters(prev.fieldFilters, fields)}));
    setColumnKeys(prev => {
      const known = new Set(allColumns(fields, t).map(c => c.key));
      const kept = prev.filter(k => known.has(k));
      return kept.length ? kept : DEFAULT_COLUMN_KEYS.filter(k => known.has(k));
    });
  }, [fields]);

  const columns = useMemo(() => allColumns(fields, t), [fields]);
  const selectedColumns = useMemo(
    () => columnKeys.map(k => columns.find(c => c.key === k)).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [columnKeys, columns]
  );
  // Exports are always scoped to exactly one project: the query box holds only the other
  // conditions and the selected project is prepended, so typing another project can't widen it.
  const query = [buildQuery({...EMPTY_FILTERS, projects: filters.projects}), chipsToQuery(chips), searchText.trim()]
    .filter(Boolean).join(' ');

  // Debounced count + preview rows --------------------------------------------
  useEffect(() => {
    // Nothing to count or preview until a project is chosen (those sections are hidden anyway).
    if (!selectedProject) {
      setCount(null);
      setPreview(null);
      setChecking(false);
      return undefined;
    }
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
  }, [query, selectedProject]);

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
    setChips([]);
    setSearchText('');
    const known = new Set(columns.map(c => c.key));
    setColumnKeys(DEFAULT_COLUMN_KEYS.filter(k => known.has(k)));
    setError(null);
    clearTimeout(doneTimer.current);
    setExportState({phase: 'idle'});
  }, [fields, columns]);

  // --- Export bar texts ---
  let issuesText: React.ReactNode;
  if (!selectedProject) {
    issuesText = '—';
  } else if (checking) {
    issuesText = <><LoaderInline/> {t('export.counting')}</>;
  } else if (count === null) {
    issuesText = <Text className="warning">{t('export.countUnknown')}</Text>;
  } else {
    issuesText = count === 1 ? t('export.issuesOne') : t('export.issuesN', {count});
  }
  const columnsText = selectedColumns.length === 1
    ? t('export.columnsOne')
    : t('export.columnsN', {count: selectedColumns.length});

  let status: React.ReactNode = null;
  if (exportState.phase === 'loading') {
    status = <Text info>{t('export.loading', {loaded: exportState.loaded, total: count ?? '?'})}</Text>;
  } else if (exportState.phase === 'building') {
    status = <Text info>{t('export.building')}</Text>;
  } else if (exportState.phase === 'done') {
    status = <Text className="success">{'✓ '}{t('export.done', {name: exportState.fileName})}</Text>;
  }

  let blocker: string | null = null;
  if (!selectedProject) {
    blocker = t('export.noProject');
  } else if (fields.length && !selectedColumns.length) {
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

  const locked = !selectedProject;

  return (
    <I18nContext.Provider value={t}>
      <div className="app">
        {/* Everything on one Ring UI Island, sections separated by lines, in the order of the flow. */}
        <Island className="card single-card" role="region" aria-labelledby="page-title">
          <header className="page-header">
            <H1 id="page-title">{t('app.heroTitle')}</H1>
            <Text info>{t('c.subtitle')}</Text>
          </header>

          <section id={SECTION_IDS[0]} className="section" aria-labelledby="filters-title">
            <div className="section-head">
              <H3 id="filters-title">{t('b.filtersTitle')}</H3>
            </div>

            {/* 1) the required project, 2) YouTrack's own query box for every other condition. */}
            <div className="query-filters">
              <div className="query-project">
                <ProjectSelect
                  projects={projects}
                  value={selectedProject}
                  onChange={p => setFilters(prev => ({...prev, projects: p ? [p] : []}))}
                />
              </div>
              <FilterBar
                fields={fields}
                chips={chips}
                text={searchText}
                tags={tags}
                disabled={!selectedProject}
                onChipsChange={setChips}
                onTextChange={setSearchText}
                searchUsers={api.searchUsers}
              />
            </div>
            <Text info>{selectedProject ? t('filter.queryHintProject') : t('filter.chooseProjectFirst')}</Text>
          </section>

          {error && <Banner mode="error" withIcon>{error}</Banner>}

          {/* Columns (left) and preview (right); inactive until a project is chosen. */}
          <div className={locked ? 'columns-preview is-disabled' : 'columns-preview'} {...inactiveProps(locked)}>
            <section id={SECTION_IDS[1]} className="section columns-pane" aria-labelledby="columns-title">
              <div className="section-head">
                <H3 id="columns-title">{t('columns.titleCount', {count: selectedColumns.length})}</H3>
              </div>
              {locked
                ? <Text info>{t('step.lockedColumns')}</Text>
                : <ColumnList available={columns} selected={columnKeys} onChange={setColumnKeys}/>}
            </section>
            <section id={SECTION_IDS[2]} className="section preview-pane" aria-labelledby="preview-title">
              <div className="section-head">
                <H3 id="preview-title">{t('b.previewTitle')}</H3>
                {!locked && previewNote && <Text info className="section-aside">{previewNote}</Text>}
              </div>
              {locked
                ? <Text info>{t('step.lockedPreview')}</Text>
                : <PreviewTable issues={preview} columns={selectedColumns} stateKeys={stateKeys} loading={checking}/>}
            </section>
          </div>

        </Island>

        {/* Export Summary: its own card below, as in the previous design. */}
        <Island
          id={SECTION_IDS[3]}
          className={selectedProject ? 'card export-bar' : 'card export-bar card--disabled'}
          role="region"
          aria-labelledby="export-title"
          {...inactiveProps(!selectedProject)}
        >
          {/* Row 1: title and what will be exported */}
          <div className="export-heading">
            <H2 id="export-title">{t('export.summary')}</H2>
            <Text info className="export-line" aria-live="polite">
              {'· '}
              {issuesText}
              {' · '}
              {columnsText}
              {` · .${format}`}
            </Text>
          </div>

          {/* Row 2: format and separator (CSV only) */}
          <div className="export-controls">
            <Segmented<ExportFormat>
              ariaLabel={t('export.format')}
              value={format}
              onChange={chooseFormat}
              options={EXPORT_FORMATS.map(f => ({value: f, label: t(FORMAT_TEXT[f].label)}))}
            />
            {format === 'csv' && (
              <Segmented<CsvDelimiter>
                ariaLabel={t('export.delimiter')}
                className="separator-group"
                value={csvDelimiter}
                onChange={chooseDelimiter}
                options={[
                  {value: ';', label: ';', title: t('export.delimiterSemicolon')},
                  {value: ',', label: ',', title: t('export.delimiterComma')}
                ]}
              />
            )}
          </div>

          {/* Row 3: one line of help about the format, replaced by progress / result / warnings when relevant */}
          <div className="export-note" aria-live="polite">
            {status ?? (!busy && blocker
              ? <Text className="warning">{blocker}</Text>
              : <Text info size={Text.Size.S}>{t(FORMAT_TEXT[format].hint)}</Text>)}
            {!busy && !blocker && exportState.phase !== 'done' && count !== null && count > LARGE_EXPORT_WARNING && (
              <Text className="warning" size={Text.Size.S}>{` ${t('export.large')}`}</Text>
            )}
            {exportState.phase === 'loading' && count
              ? <ProgressBar className="progress" value={exportState.loaded} max={count} label={t('export.loading', {loaded: exportState.loaded, total: count})}/>
              : null}
          </div>

          {/* Row 4: the download button on its own line (with Reset next to it) */}
          <div className="export-actions">
            <Button primary inline={false} icon={downloadIcon} onClick={doExport} disabled={busy || Boolean(blocker) || checking} loader={busy}>
              {t(FORMAT_TEXT[format].download)}
            </Button>
            <Button onClick={reset} disabled={busy || !selectedProject}>{t('export.reset')}</Button>
          </div>
        </Island>
      </div>
    </I18nContext.Provider>
  );
};

export const App = memo(AppComponent);
