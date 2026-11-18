import React, {useMemo, useState} from 'react';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import type {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import Text from '@jetbrains/ring-ui-built/components/text/text';

import {detectPreset, formatRange, presetRange} from '../lib/dates';
import type {DatePreset} from '../lib/dates';
import {useT} from '../lib/i18n';
import type {MessageKey, Translate} from '../lib/i18n';
import {chevronDownIcon, closeIcon, filterSmallIcon} from '../lib/icons';
import type {DateRange, FieldFilter, FieldMeta, Filters, Project, ResolvedFilter, SavedQuery} from '../lib/types';
import type {YouTrackApi} from '../lib/youtrack';
import {DateRangeFilter} from './DateRangeFilter';
import {FieldFilterControl, filterKindFor, userLabels} from './FieldFilterControl';

/** Field filters shown in the main grid; every other field filter goes under "More filters". */
export const PINNED_FIELDS = ['State', 'Assignee'];

type Item = SelectItem<{value: string}>;
const toItem = (value: string, label = value): Item => ({key: value, label, value});

interface Props {
  api: YouTrackApi;
  projects: Project[];
  fields: FieldMeta[];
  tags: string[];
  savedQueries: SavedQuery[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  onSavedQuery: (query: SavedQuery) => void;
  /** Extra content at the right end of the "Advanced filters" row (e.g. "Edit as YouTrack query"). */
  toolbarEnd?: React.ReactNode;
  /** The row of removable active-filter tags (off in the single-card layout). */
  showActiveFilters?: boolean;
}

function Field({label, children, onRemove}: {label: string; children: React.ReactNode; onRemove?: () => void}) {
  const t = useT();
  return (
    <div className="field">
      <div className="field-label">
        <span title={label}>{label}</span>
        {onRemove && (
          <Button inline icon={closeIcon} onClick={onRemove} aria-label={`${t('filter.remove')}: ${label}`} title={t('filter.remove')}/>
        )}
      </div>
      {children}
    </div>
  );
}

// --- Quick presets -------------------------------------------------------------

const withFieldValues = (filters: Filters, field: FieldMeta, values: string[]): Filters => {
  const exists = filters.fieldFilters.some(f => f.field === field.name);
  const fieldFilters = exists
    ? filters.fieldFilters.map(f => (f.field === field.name ? {...f, values} : f))
    : [...filters.fieldFilters, {field: field.name, kind: filterKindFor(field), values}];
  return {...filters, fieldFilters};
};

interface QuickPreset {
  id: MessageKey;
  active: (f: Filters) => boolean;
  toggle: (f: Filters, on: boolean) => Filters;
}

function quickPresets(fields: FieldMeta[]): QuickPreset[] {
  const assignee = fields.find(f => f.name === 'Assignee' && f.valueType === 'user');
  const dateToggle = (key: 'created' | 'updated', preset: DatePreset): Omit<QuickPreset, 'id'> => ({
    active: f => detectPreset(f[key]) === preset,
    toggle: (f, on) => ({...f, [key]: on ? presetRange(preset) : {}})
  });
  const presets: QuickPreset[] = [
    {
      id: 'preset.open',
      active: f => f.resolved === 'unresolved',
      toggle: (f, on) => ({...f, resolved: on ? 'unresolved' : 'any'})
    }
  ];
  if (assignee) {
    const assigneeValues = (f: Filters) => f.fieldFilters.find(ff => ff.field === assignee.name)?.values ?? [];
    presets.push({
      id: 'preset.mine',
      active: f => assigneeValues(f).includes('me'),
      toggle: (f, on) => withFieldValues(f, assignee,
        on ? [...assigneeValues(f).filter(v => v !== 'me'), 'me'] : assigneeValues(f).filter(v => v !== 'me'))
    });
  }
  presets.push(
    {id: 'preset.createdThisMonth', ...dateToggle('created', 'thisMonth')},
    {id: 'preset.updatedWeek', ...dateToggle('updated', 'last7')}
  );
  return presets;
}

// --- Active filter chips -------------------------------------------------------

interface Chip {
  id: string;
  text: string;
  remove: (f: Filters) => Filters;
}

function rangeText(range: DateRange, t: Translate): string {
  const preset = detectPreset(range);
  return preset === 'custom' ? formatRange(range) : t(`date.${preset}` as MessageKey);
}

function fieldFilterText(ff: FieldFilter, t: Translate): string | null {
  switch (ff.kind) {
    case 'values':
      return ff.values.length ? ff.values.join(', ') : null;
    case 'users':
      return ff.values.length
        ? ff.values.map(v => (v === 'me' ? t('filter.me') : userLabels.get(v) ?? v)).join(', ')
        : null;
    case 'range':
      return ff.from || ff.to ? (/^\d{4}-/.test(ff.from ?? ff.to ?? '') ? rangeText(ff, t) : `${ff.from || '…'} – ${ff.to || '…'}`) : null;
    case 'text':
      return ff.text?.trim() ? `“${ff.text.trim()}”` : null;
    default:
      return null;
  }
}

function activeChips(filters: Filters, projects: Project[], t: Translate): Chip[] {
  const chips: Chip[] = [];
  if (filters.projects.length) {
    const names = filters.projects.map(s => projects.find(p => p.shortName === s)?.name ?? s);
    chips.push({id: 'projects', text: `${t('filter.project')}: ${names.join(', ')}`, remove: f => ({...f, projects: []})});
  }
  if (filters.resolved !== 'any') {
    const label = t(filters.resolved === 'unresolved' ? 'filter.statusOpen' : 'filter.statusResolved');
    chips.push({id: 'resolved', text: `${t('filter.status')}: ${label}`, remove: f => ({...f, resolved: 'any'})});
  }
  for (const ff of filters.fieldFilters) {
    const text = fieldFilterText(ff, t);
    if (text) {
      chips.push({
        id: `cf:${ff.field}`,
        text: `${ff.field}: ${text}`,
        remove: f => ({
          ...f,
          fieldFilters: f.fieldFilters.map(x => (x.field === ff.field ? {...x, values: [], from: undefined, to: undefined, text: ''} : x))
        })
      });
    }
  }
  for (const key of ['created', 'updated'] as const) {
    if (filters[key].from || filters[key].to) {
      chips.push({id: key, text: `${t(`filter.${key}`)}: ${rangeText(filters[key], t)}`, remove: f => ({...f, [key]: {}})});
    }
  }
  for (const tag of filters.tags) {
    chips.push({id: `tag:${tag}`, text: `${t('filter.tags')}: ${tag}`, remove: f => ({...f, tags: f.tags.filter(x => x !== tag)})});
  }
  if (filters.text.trim()) {
    chips.push({id: 'text', text: `${t('filter.text')}: “${filters.text.trim()}”`, remove: f => ({...f, text: ''})});
  }
  return chips;
}

// --- Project (required, exactly one) -------------------------------------------

interface ProjectSelectProps {
  projects: Project[];
  /** Short name of the selected project, if any. */
  value: string | undefined;
  onChange: (shortName: string | undefined) => void;
}

/**
 * Exports are always scoped to exactly one project: a single-choice select
 * (no multi-select), marked as required. Used in the filter grid and in query-editor mode.
 */
export function ProjectSelect({projects, value, onChange}: ProjectSelectProps) {
  const t = useT();
  const items = useMemo(() => projects.map(p => ({...toItem(p.shortName, p.name), description: p.shortName})), [projects]);
  const label = `${t('filter.project')} *`;
  return (
    <Field label={label}>
      <Select<{value: string}>
        filter
        clear
        size={Size.FULL}
        data={items}
        selected={items.find(i => i.value === value) ?? null}
        label={t('filter.projectSelect')}
        aria-required
        onChange={(item: Item | null) => onChange(item?.value)}
      />
    </Field>
  );
}

// --- Quick filters (rendered next to the card title) ---------------------------

export function QuickPresets({fields, filters, onChange, showLabel = true}: Pick<Props, 'fields' | 'filters' | 'onChange'> & {showLabel?: boolean}) {
  const t = useT();
  const presets = useMemo(() => quickPresets(fields), [fields]);
  return (
    <div className="quick-presets" role="group" aria-labelledby="quick-filters-label">
      <Text id="quick-filters-label" info className={showLabel ? undefined : 'visually-hidden'}>{t('filter.quickColon')}</Text>
      {presets.map(p => {
        const active = p.active(filters);
        return (
          <Button key={p.id} active={active} aria-pressed={active} onClick={() => onChange(p.toggle(filters, !active))}>
            {t(p.id)}
          </Button>
        );
      })}
    </div>
  );
}

// --- Panel ---------------------------------------------------------------------

export function FilterPanel({api, projects, fields, tags, savedQueries, filters, onChange, onSavedQuery, toolbarEnd, showActiveFilters = true}: Props) {
  const t = useT();
  const statusItems: SelectItem<{value: ResolvedFilter}>[] = [
    {key: 'any', label: t('filter.statusAny'), value: 'any'},
    {key: 'unresolved', label: t('filter.statusOpen'), value: 'unresolved'},
    {key: 'resolved', label: t('filter.statusResolved'), value: 'resolved'}
  ];
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({...filters, [key]: value});

  const tagItems = useMemo(() => tags.map(tag => toItem(tag)), [tags]);
  const savedItems = useMemo(() => savedQueries.map(q => ({key: q.id, label: q.name, description: q.query, value: q.id})), [savedQueries]);
  const chips = activeChips(filters, projects, t);

  const fieldMeta = (name: string) => fields.find(f => f.name === name);
  const pinned = filters.fieldFilters.filter(f => PINNED_FIELDS.includes(f.field));
  const extra = filters.fieldFilters.filter(f => !PINNED_FIELDS.includes(f.field));
  const usedFields = new Set(filters.fieldFilters.map(f => f.field));
  const addableFields = fields.filter(f => !usedFields.has(f.name)).map(f => toItem(f.name));

  const extraActive = extra.length + filters.tags.length + (filters.text.trim() ? 1 : 0);
  const [moreOpen, setMoreOpen] = useState(extraActive > 0);

  const updateFieldFilter = (ff: FieldFilter) =>
    set('fieldFilters', filters.fieldFilters.map(f => (f.field === ff.field ? ff : f)));
  const removeFieldFilter = (name: string) =>
    set('fieldFilters', filters.fieldFilters.filter(f => f.field !== name));
  const addFieldFilter = (name: string) => {
    const meta = fieldMeta(name);
    if (meta) {
      set('fieldFilters', [...filters.fieldFilters, {field: name, kind: filterKindFor(meta), values: []}]);
    }
  };

  const renderFieldFilter = (ff: FieldFilter, removable: boolean) => (
    <Field key={ff.field} label={ff.field} onRemove={removable ? () => removeFieldFilter(ff.field) : undefined}>
      <FieldFilterControl api={api} meta={fieldMeta(ff.field)} filter={ff} onChange={updateFieldFilter}/>
    </Field>
  );

  return (
    <div className="filters">
      <div className="filter-grid">
        <ProjectSelect projects={projects} value={filters.projects[0]} onChange={p => set('projects', p ? [p] : [])}/>

        <Field label={t('filter.status')}>
          <Select<{value: ResolvedFilter}>
            size={Size.FULL}
            data={statusItems}
            selected={statusItems.find(i => i.value === filters.resolved)}
            onChange={(item: SelectItem<{value: ResolvedFilter}> | null) => set('resolved', item?.value ?? 'any')}
          />
        </Field>

        {pinned.map(ff => renderFieldFilter(ff, false))}

        <Field label={t('filter.created')}>
          <DateRangeFilter value={filters.created} onChange={r => set('created', r)}/>
        </Field>
        <Field label={t('filter.updated')}>
          <DateRangeFilter value={filters.updated} onChange={r => set('updated', r)}/>
        </Field>
      </div>

      <div className="filters-toolbar">
        <Button
          inline
          iconRight={chevronDownIcon}
          className={moreOpen ? 'more-toggle more-toggle--open' : 'more-toggle'}
          aria-expanded={moreOpen}
          aria-controls="advanced-filters"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          {moreOpen ? t('filter.less') : t('filter.more')}
          {!moreOpen && extraActive > 0 && ` (${extraActive})`}
        </Button>
        {toolbarEnd}
      </div>

      {moreOpen && (
        <div className="filter-grid" id="advanced-filters">
          <Field label={t('filter.tags')}>
            <Select<{value: string}>
              multiple
              filter
              size={Size.FULL}
              data={tagItems}
              selected={filters.tags.map(tag => toItem(tag))}
              label={t('filter.tagsAny')}
              onChange={sel => set('tags', sel.map(s => s.value))}
            />
          </Field>
          <Field label={t('filter.text')}>
            <Input
              size={Size.FULL}
              placeholder={t('filter.textPlaceholder')}
              value={filters.text}
              onChange={e => set('text', e.target.value)}
            />
          </Field>

          {extra.map(ff => renderFieldFilter(ff, true))}

          <Field label={t('filter.savedSearch')}>
            <Select<{value: string}>
              filter
              size={Size.FULL}
              data={savedItems}
              selected={null}
              label={t('filter.savedSearchPlaceholder')}
              disabled={!savedItems.length}
              onChange={(item: Item | null) => {
                const q = savedQueries.find(s => s.id === item?.value);
                if (q) {
                  onSavedQuery(q);
                }
              }}
            />
          </Field>
          <Field label={' '}>
            <Select<{value: string}>
              filter
              size={Size.FULL}
              data={addableFields}
              selected={null}
              label={t('filter.addField')}
              disabled={!addableFields.length}
              onChange={(item: Item | null) => item && addFieldFilter(item.value)}
            />
          </Field>
        </div>
      )}

      {showActiveFilters && <div className="active-filters" aria-live="polite">
        <Icon glyph={filterSmallIcon} className="muted-icon"/>
        {chips.length === 0
          ? <Text info>{t('filter.none')}</Text>
          : (
            <>
              <Text info>{t('filter.activeColon')}</Text>
              {chips.map(c => (
                <Tag key={c.id} onRemove={() => onChange(c.remove(filters))}>
                  {c.text}
                </Tag>
              ))}
              <Button inline onClick={() => onChange(chips.reduce((f, c) => c.remove(f), filters))}>
                {t('filter.clearAll')}
              </Button>
            </>
          )}
      </div>}
    </div>
  );
}
