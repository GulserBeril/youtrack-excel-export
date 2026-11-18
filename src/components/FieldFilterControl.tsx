import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import type {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';

import {useT} from '../lib/i18n';
import type {FieldFilter, FieldMeta, FilterKind} from '../lib/types';
import type {YouTrackApi} from '../lib/youtrack';
import {DateRangeFilter} from './DateRangeFilter';

const DATE_TYPES = new Set(['date', 'date and time']);
const RANGE_TYPES = new Set(['date', 'date and time', 'integer', 'float', 'period']);

/** Decides which filter control fits a YouTrack field type. */
export function filterKindFor(field: FieldMeta): FilterKind {
  if (field.valueType === 'user') {
    return 'users';
  }
  if (RANGE_TYPES.has(field.valueType)) {
    return 'range';
  }
  if (field.valueType === 'string' || field.valueType === 'text') {
    return 'text';
  }
  return 'values';
}

type Item = SelectItem<{value: string}>;
const toItem = (value: string, label = value): Item => ({key: value, label, value});

/** Remembers login -> full name, so chips and selections show real names. */
export const userLabels = new Map<string, string>();

interface Props {
  meta: FieldMeta | undefined;
  filter: FieldFilter;
  api: YouTrackApi;
  onChange: (filter: FieldFilter) => void;
}

/**
 * Multi-select of users. When the project's assignable users are known (meta.users), the list
 * contains exactly those people and Ring's own filter searches them; otherwise users are searched
 * on the server as the user types.
 */
function UserSelect({meta, filter, api, onChange}: Props) {
  const t = useT();
  const me = useMemo(() => toItem('me', t('filter.me')), [t]);
  const projectUsers = meta?.users;
  const [items, setItems] = useState<Item[]>([me]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (projectUsers) {
      projectUsers.forEach(u => userLabels.set(u.login, u.fullName || u.login));
      setItems([me, ...projectUsers.map(u => toItem(u.login, u.fullName || u.login))]);
    }
  }, [projectUsers, me]);

  const search = useCallback((text: string) => {
    if (projectUsers) {
      return; // the project's users are already loaded; Select filters them locally
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await api.searchUsers(text);
        users.forEach(u => userLabels.set(u.login, u.fullName || u.login));
        setItems([me, ...users.map(u => toItem(u.login, u.fullName || u.login))]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [api, me, projectUsers]);

  useEffect(() => {
    search('');
    return () => clearTimeout(timer.current);
  }, [search]);

  const label = (login: string) => (login === 'me' ? t('filter.me') : userLabels.get(login) ?? login);

  return (
    <Select<{value: string}>
      multiple
      filter
      size={Size.FULL}
      loading={loading}
      data={items}
      selected={filter.values.map(v => toItem(v, label(v)))}
      onFilter={search}
      label={t('filter.anyUser')}
      onChange={sel => onChange({...filter, values: sel.map(s => s.value)})}
    />
  );
}

/** The input control for one field filter; the label is rendered by the caller. */
export function FieldFilterControl({meta, filter, api, onChange}: Props) {
  const t = useT();
  const items = useMemo(() => (meta?.values ?? []).map(v => toItem(v)), [meta]);

  switch (filter.kind) {
    case 'values':
      return (
        <Select<{value: string}>
          multiple
          filter
          size={Size.FULL}
          data={items}
          selected={filter.values.map(v => toItem(v))}
          label={t('filter.anyValue')}
          onChange={sel => onChange({...filter, values: sel.map(s => s.value)})}
        />
      );
    case 'users':
      return <UserSelect meta={meta} filter={filter} api={api} onChange={onChange}/>;
    case 'range':
      if (meta && DATE_TYPES.has(meta.valueType)) {
        return (
          <DateRangeFilter
            value={{from: filter.from, to: filter.to}}
            onChange={r => onChange({...filter, from: r.from, to: r.to})}
          />
        );
      }
      return (
        <span className="range-inputs">
          <Input
            size={Size.FULL}
            placeholder={t('filter.from')}
            value={filter.from ?? ''}
            onChange={e => onChange({...filter, from: e.target.value})}
          />
          <span aria-hidden>{'–'}</span>
          <Input
            size={Size.FULL}
            placeholder={t('filter.to')}
            value={filter.to ?? ''}
            onChange={e => onChange({...filter, to: e.target.value})}
          />
        </span>
      );
    case 'text':
      return (
        <Input
          size={Size.FULL}
          placeholder={t('filter.contains')}
          value={filter.text ?? ''}
          onChange={e => onChange({...filter, text: e.target.value})}
        />
      );
    default:
      return null;
  }
}
