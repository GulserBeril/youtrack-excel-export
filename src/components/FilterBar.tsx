import React, {useEffect, useMemo, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import type {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';

import {useT} from '../lib/i18n';
import {addIcon, closeIcon, searchIcon} from '../lib/icons';
import {quote} from '../lib/query';
import type {FieldMeta, UserRef} from '../lib/types';

/**
 * Issue filter built the way YouTrack's own search bar works:
 *   "+" (or typing in the list) picks a field → the field becomes a chip "Assignee is"
 *   and its value list opens → values are ticked (several allowed, OR-ed) and show as small tags
 *   with × → the results update at once. Free text can be typed next to the chips.
 * Every chip turns into the same query YouTrack builds, e.g. `Assignee: emin.arslan, me`.
 */

export type ChipKind = 'values' | 'users' | 'dates' | 'tags';

export interface FilterChip {
  field: string;
  kind: ChipKind;
  values: string[];
}

interface FieldOption {
  /** Name used in the query (also the label). */
  name: string;
  kind: ChipKind;
  /** Bundle values (values) or preset date keywords (dates). */
  values?: string[];
  /** For user fields: whether "Unassigned" is a valid value (custom fields only). */
  canBeEmpty?: boolean;
}

/** Date keywords of the YouTrack query language, as offered in its search bar. */
const DATE_PRESETS = ['Today', 'Yesterday', 'This week', 'Last week', 'This month', 'Last month', 'This year'];
const DATE_TYPES = new Set(['date', 'date and time']);
const VALUE_TYPES = new Set(['enum', 'state', 'ownedField', 'version', 'build', 'group']);
/** Same leading order as YouTrack's field list; the rest follows alphabetically. */
const FIELD_ORDER = ['State', 'Assignee', 'Type', 'Tag', 'Created', 'Reporter', 'Priority', 'Subsystem', 'Updated'];

export function chipsToQuery(chips: FilterChip[]): string {
  return chips
    .filter(c => c.values.length)
    .map(c => `${quote(c.field)}: ${c.values.map(quote).join(', ')}`)
    .join(' ');
}

function fieldOptions(fields: FieldMeta[]): FieldOption[] {
  const custom = fields.flatMap((f): FieldOption[] => {
    if (f.valueType === 'user') {
      return [{name: f.name, kind: 'users', canBeEmpty: true}];
    }
    if (DATE_TYPES.has(f.valueType)) {
      return [{name: f.name, kind: 'dates', values: DATE_PRESETS}];
    }
    if (VALUE_TYPES.has(f.valueType) || f.values.length) {
      return [{name: f.name, kind: 'values', values: f.values}];
    }
    return []; // numbers, periods and text: covered by free-text search
  });
  const builtIn = ([
    {name: 'Tag', kind: 'tags'},
    {name: 'Reporter', kind: 'users'},
    {name: 'Created', kind: 'dates', values: DATE_PRESETS},
    {name: 'Updated', kind: 'dates', values: DATE_PRESETS},
    {name: 'Resolved date', kind: 'dates', values: DATE_PRESETS}
  ] as FieldOption[]).filter(b => !custom.some(c => c.name.toLowerCase() === b.name.toLowerCase()));
  const rank = (name: string) => {
    const i = FIELD_ORDER.indexOf(name);
    return i === -1 ? FIELD_ORDER.length : i;
  };
  return [...custom, ...builtIn].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

type Item = SelectItem<{value: string}>;
const toItem = (value: string, label = value, description?: string): Item => ({key: value, label, value, description});

interface Props {
  fields: FieldMeta[];
  chips: FilterChip[];
  text: string;
  disabled?: boolean;
  /** Tags the user can see (loaded once). */
  tags: string[];
  onChipsChange: (chips: FilterChip[]) => void;
  onTextChange: (text: string) => void;
  searchUsers: (text: string) => Promise<UserRef[]>;
}

export function FilterBar({fields, chips, text, disabled, tags, onChipsChange, onTextChange, searchUsers}: Props) {
  const t = useT();
  const options = useMemo(() => fieldOptions(fields), [fields]);
  // Field whose value list opens right after it was picked (as in YouTrack).
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [addKey, setAddKey] = useState(0);

  // Users of all user fields of the project, for Reporter and as names for logins.
  const projectUsers = useMemo(() => {
    const byLogin = new Map<string, UserRef>();
    fields.forEach(f => f.users?.forEach(u => byLogin.set(u.login, u)));
    return [...byLogin.values()].sort((a, b) => (a.fullName || a.login).localeCompare(b.fullName || b.login));
  }, [fields]);

  const used = new Set(chips.map(c => c.field));
  const addItems = options.filter(o => !used.has(o.name)).map(o => toItem(o.name));

  const addChip = (name: string) => {
    const option = options.find(o => o.name === name);
    if (!option) {
      return;
    }
    onChipsChange([...chips, {field: option.name, kind: option.kind, values: []}]);
    setJustAdded(option.name);
    setAddKey(k => k + 1);
  };
  const updateChip = (field: string, values: string[]) =>
    onChipsChange(chips.map(c => (c.field === field ? {...c, values} : c)));
  const removeChip = (field: string) => onChipsChange(chips.filter(c => c.field !== field));

  return (
    <div className="filter-bar" role="group" aria-label={t('filter.queryLabel')}>
      {chips.map(chip => (
        <ChipEditor
          key={chip.field}
          chip={chip}
          option={options.find(o => o.name === chip.field)}
          tags={tags}
          projectUsers={projectUsers}
          searchUsers={searchUsers}
          openOnMount={justAdded === chip.field}
          disabled={disabled}
          onChange={values => updateChip(chip.field, values)}
          onRemove={() => removeChip(chip.field)}
          onClosedEmpty={() => removeChip(chip.field)}
        />
      ))}

      <Select
        key={addKey}
        data={addItems}
        filter={{placeholder: t('filter.fieldSearch')}}
        disabled={disabled || !addItems.length}
        onSelect={item => item && addChip(String(item.key))}
        type={Select.Type.CUSTOM}
        customAnchor={({wrapperProps, buttonProps, popup}) => (
          <span {...wrapperProps} className="filter-add">
            <Button
              {...buttonProps}
              icon={addIcon}
              title={t('filter.addFilter')}
              aria-label={t('filter.addFilter')}
            >
              {chips.length ? null : t('filter.addFilter')}
            </Button>
            {popup}
          </span>
        )}
      />

      <Input
        className="filter-text"
        size={Size.AUTO}
        borderless
        icon={searchIcon}
        value={text}
        disabled={disabled}
        placeholder={t('filter.textSearch')}
        aria-label={t('filter.textSearch')}
        onChange={e => onTextChange(e.target.value)}
        onClear={text ? () => onTextChange('') : undefined}
      />
    </div>
  );
}

interface ChipProps {
  chip: FilterChip;
  option: FieldOption | undefined;
  tags: string[];
  projectUsers: UserRef[];
  searchUsers: (text: string) => Promise<UserRef[]>;
  openOnMount: boolean;
  disabled?: boolean;
  onChange: (values: string[]) => void;
  onRemove: () => void;
  onClosedEmpty: () => void;
}

/** One "Field is value, value" chip; the field name opens the value list (multi-select with search). */
function ChipEditor({chip, option, tags, projectUsers, searchUsers, openOnMount, disabled, onChange, onRemove, onClosedEmpty}: ChipProps) {
  const t = useT();
  const [found, setFound] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(false);

  // When the project's users aren't readable, users are searched on the server as you type.
  const serverSearch = chip.kind === 'users' && !projectUsers.length;
  useEffect(() => {
    if (serverSearch) {
      searchUsers('').then(setFound).catch(() => setFound([]));
    }
  }, [serverSearch, searchUsers]);

  const users = serverSearch ? found : projectUsers;
  const userName = (login: string) => {
    if (login === 'me') {
      return t('filter.me');
    }
    if (login === 'Unassigned') {
      return t('filter.unassigned');
    }
    const u = [...projectUsers, ...found].find(x => x.login === login);
    return u?.fullName || login;
  };

  let data: Item[];
  if (chip.kind === 'users') {
    data = [
      ...(option?.canBeEmpty ? [toItem('Unassigned', t('filter.unassigned'))] : []),
      toItem('me', t('filter.me')),
      ...users.map(u => toItem(u.login, u.fullName || u.login, u.login))
    ];
  } else if (chip.kind === 'tags') {
    data = tags.map(v => toItem(v));
  } else {
    data = (option?.values ?? []).map(v => toItem(v));
  }
  const label = (v: string) => (chip.kind === 'users' ? userName(v) : v);
  const selected = chip.values.map(v => data.find(d => d.key === v) ?? toItem(v, label(v)));

  return (
    <span className="filter-chip">
      <Select
        multiple
        data={data}
        selected={selected}
        filter={{placeholder: t('filter.valueSearch')}}
        loading={loading}
        showPopup={openOnMount}
        disabled={disabled}
        onFilter={serverSearch ? (q: string) => {
          setLoading(true);
          searchUsers(q).then(setFound).catch(() => setFound([])).finally(() => setLoading(false));
        } : undefined}
        onChange={items => onChange(items.map(i => String(i.key)))}
        onClose={items => {
          if (!items.length) {
            onClosedEmpty();
          }
        }}
        type={Select.Type.CUSTOM}
        customAnchor={({wrapperProps, buttonProps, popup}) => (
          <span {...wrapperProps} className="filter-chip-anchor">
            <Button {...buttonProps} inline className="filter-chip-field" aria-label={`${chip.field} ${t('filter.is')}`}>
              <strong>{chip.field}</strong>
              <span className="filter-chip-op">{t('filter.is')}</span>
            </Button>
            {popup}
          </span>
        )}
      />
      {chip.values.map(v => (
        <Tag
          key={v}
          className="filter-chip-value"
          readOnly={disabled}
          onRemove={() => onChange(chip.values.filter(x => x !== v))}
        >
          {label(v)}
        </Tag>
      ))}
      <Button
        icon={closeIcon}
        className="filter-chip-remove"
        title={t('filter.remove')}
        aria-label={`${t('filter.remove')}: ${chip.field}`}
        disabled={disabled}
        onClick={onRemove}
      />
    </span>
  );
}
