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

import React, {useEffect, useMemo, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';
import PopupMenu from '@jetbrains/ring-ui-built/components/popup-menu/popup-menu';
import {Directions} from '@jetbrains/ring-ui-built/components/popup/popup.consts';
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

/** One row of the typing suggestions: a field to filter by, a value of a field, or a text search. */
interface Suggestion {
  kind: 'field' | 'value' | 'text';
  field?: string;
  value: string;
  label: string;
  description: string;
}

const MAX_VALUE_SUGGESTIONS = 8;

export function FilterBar({fields, chips, text, disabled, tags, onChipsChange, onTextChange, searchUsers}: Props) {
  const t = useT();
  const options = useMemo(() => fieldOptions(fields), [fields]);
  // Field whose value list opens right after it was picked (as in YouTrack).
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [addKey, setAddKey] = useState(0);
  // What is being typed in the bar. Typing works like "+": it suggests fields (and values);
  // the last row (or Enter on it) searches for the typed text instead.
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);

  // Users of all user fields of the project, for Reporter and as names for logins.
  const projectUsers = useMemo(() => {
    const byLogin = new Map<string, UserRef>();
    fields.forEach(f => f.users?.forEach(u => byLogin.set(u.login, u)));
    return [...byLogin.values()].sort((a, b) => (a.fullName || a.login).localeCompare(b.fullName || b.login));
  }, [fields]);

  const used = new Set(chips.map(c => c.field));
  const addItems = options.filter(o => !used.has(o.name)).map(o => toItem(o.name));

  const suggestions = useMemo((): Suggestion[] => {
    /** Values a field offers, as [query value, label]. */
    const valuesOf = (o: FieldOption): [string, string][] => {
      if (o.kind === 'users') {
        return [
          ...(o.canBeEmpty ? [['Unassigned', t('filter.unassigned')] as [string, string]] : []),
          ['me', t('filter.me')],
          ...projectUsers.map((u): [string, string] => [u.login, u.fullName || u.login])
        ];
      }
      if (o.kind === 'tags') {
        return tags.map((v): [string, string] => [v, v]);
      }
      return (o.values ?? []).map((v): [string, string] => [v, v]);
    };
    const usedFields = new Set(chips.map(c => c.field));
    const typed = draft.trim();
    const q = typed.toLocaleLowerCase();
    const fieldRow = (o: FieldOption): Suggestion =>
      ({kind: 'field', field: o.name, value: o.name, label: o.name, description: t('filter.suggestField')});
    if (!q) {
      return options.filter(o => !usedFields.has(o.name)).map(fieldRow);
    }
    // "State: op" → only values of State.
    const colon = /^\{?([^:{}]+)\}?:\s*(.*)$/.exec(typed);
    const scoped = colon ? options.find(o => o.name.toLocaleLowerCase() === colon[1].trim().toLocaleLowerCase()) : undefined;
    const valueQuery = scoped && colon ? colon[2].toLocaleLowerCase() : q;
    const rank = (s: string) => (s.toLocaleLowerCase().startsWith(valueQuery) ? 0 : 1);

    const fieldRows = scoped ? [] : options
      .filter(o => !usedFields.has(o.name) && o.name.toLocaleLowerCase().includes(q))
      .sort((a, b) => rank(a.name) - rank(b.name))
      .map(fieldRow);
    const valueRows = (scoped ? [scoped] : options.filter(o => o.kind !== 'dates'))
      .flatMap(o => valuesOf(o)
        .filter(([value, label]) => !chips.find(c => c.field === o.name)?.values.includes(value) &&
          (!valueQuery || label.toLocaleLowerCase().includes(valueQuery) || value.toLocaleLowerCase().includes(valueQuery)))
        .map(([value, label]): Suggestion => ({kind: 'value', field: o.name, value, label, description: o.name})))
      .sort((a, b) => rank(a.label) - rank(b.label))
      .slice(0, scoped ? 50 : MAX_VALUE_SUGGESTIONS);
    const textRow: Suggestion = {kind: 'text', value: typed, label: typed, description: t('filter.suggestText')};
    return [...fieldRows, ...valueRows, ...(scoped ? [] : [textRow])];
  }, [draft, options, chips, tags, projectUsers, t]);

  useEffect(() => setActive(0), [draft]);

  const addChip = (name: string) => {
    const option = options.find(o => o.name === name);
    if (!option) {
      return;
    }
    onChipsChange([...chips, {field: option.name, kind: option.kind, values: []}]);
    setJustAdded(option.name);
    setAddKey(k => k + 1);
  };
  const addValue = (field: string, value: string) => {
    const option = options.find(o => o.name === field);
    if (!option) {
      return;
    }
    const existing = chips.find(c => c.field === field);
    onChipsChange(existing
      ? chips.map(c => (c.field === field ? {...c, values: [...c.values, value]} : c))
      : [...chips, {field, kind: option.kind, values: [value]}]);
  };
  const updateChip = (field: string, values: string[]) =>
    onChipsChange(chips.map(c => (c.field === field ? {...c, values} : c)));
  const removeChip = (field: string) => onChipsChange(chips.filter(c => c.field !== field));
  const addText = (value: string) => onTextChange([text.trim(), value.trim()].filter(Boolean).join(' '));

  const choose = (s: Suggestion | undefined) => {
    if (!s) {
      return;
    }
    if (s.kind === 'field' && s.field) {
      // The new chip's value list takes over, as when the field is picked with "+".
      inputRef.current?.blur();
      setFocused(false);
      addChip(s.field);
    } else if (s.kind === 'value' && s.field) {
      addValue(s.field, s.value);
    } else if (s.value) {
      addText(s.value);
    }
    setDraft('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setFocused(true);
      setActive(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setActive(i => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (draft.trim()) {
        choose(suggestions[active]);
      }
    } else if (e.key === 'Escape') {
      setFocused(false);
    } else if (e.key === 'Backspace' && !draft) {
      // Like YouTrack: Backspace in an empty bar removes the last condition.
      if (text) {
        onTextChange('');
      } else if (chips.length) {
        removeChip(chips[chips.length - 1].field);
      }
    }
  };

  const listData = suggestions.map((s, i) => ({
    key: `${s.kind}:${s.field ?? ''}:${s.value}:${i}`,
    label: s.label,
    description: s.description,
    index: i
  }));
  const showSuggestions = focused && !disabled && suggestions.length > 0;

  return (
    <div className={disabled ? 'filter-bar filter-bar--disabled' : 'filter-bar'} role="search" aria-label={t('filter.queryLabel')}>
      {/* Left: "+", the chips and the text box, wrapping like YouTrack's search bar. */}
      <div className="filter-bar-main">
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

      {text && (
        <Tag className="filter-chip-value" readOnly={disabled} onRemove={() => onTextChange('')}>
          {`${t('filter.textTag')}: ${text}`}
        </Tag>
      )}

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
              // Icon only: drop the Select placeholder that buttonProps carries as children.
              children={null}
            />
            {popup}
          </span>
        )}
      />

      <span className="filter-text" ref={setAnchor}>
        <Input
          size={Size.FULL}
          borderless
          inputRef={el => {
            inputRef.current = el;
          }}
          value={draft}
          disabled={disabled}
          placeholder={t('filter.queryPlaceholder')}
          aria-label={t('filter.queryPlaceholder')}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={e => {
            setDraft(e.target.value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          // Delayed, so a click on a suggestion (which blurs the input first) still selects it.
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={onKeyDown}
        />
        <PopupMenu
          hidden={!showSuggestions}
          anchorElement={anchor}
          data={listData}
          activeIndex={active}
          shortcuts={false}
          autoFocusFirst={false}
          trapFocus={false}
          directions={[Directions.BOTTOM_RIGHT, Directions.TOP_RIGHT]}
          maxHeight={320}
          onSelect={item => choose(suggestions[(item as {index?: number}).index ?? -1])}
          onCloseAttempt={() => setFocused(false)}
        />
      </span>
      </div>

      {/* Right: clear and search, like the buttons at the end of YouTrack's search bar. */}
      <div className="filter-bar-actions">
        {(chips.length > 0 || text || draft) && (
          <Button
            icon={closeIcon}
            className="filter-bar-clear"
            title={t('filter.clearAll')}
            aria-label={t('filter.clearAll')}
            disabled={disabled}
            onClick={() => {
              setDraft('');
              onTextChange('');
              onChipsChange([]);
            }}
          />
        )}
        <Button
          icon={searchIcon}
          className="filter-bar-search"
          title={t('filter.searchButton')}
          aria-label={t('filter.searchButton')}
          disabled={disabled}
          onClick={() => {
            // Like Enter on the text row: the typed text becomes a text search.
            if (draft.trim()) {
              addText(draft);
              setDraft('');
            }
            setFocused(false);
          }}
        />
      </div>
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
        // Keep the list open while ticking values, like the value list in YouTrack's search bar.
        tryKeepOpen
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
