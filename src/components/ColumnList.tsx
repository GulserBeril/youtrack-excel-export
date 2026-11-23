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

import React, {useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import type {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Text from '@jetbrains/ring-ui-built/components/text/text';

import {useT} from '../lib/i18n';
import {addIcon, closeIcon, dragIcon, searchIcon} from '../lib/icons';
import type {ColumnDef} from '../lib/types';

interface Props {
  available: ColumnDef[];
  selected: string[];
  onChange: (keys: string[]) => void;
}

type Item = SelectItem<{value: string}>;

/**
 * Compact column picker for the single-card layout: the selected columns in file order
 * (drag, or Alt+↑/↓ on a focused row; × removes), a search box that filters them and offers
 * matching fields to add, and an "Add columns" menu with every field that is not selected yet.
 */
export function ColumnList({available, selected, onChange}: Props) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [addMenuKey, setAddMenuKey] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const byKey = new Map(available.map(c => [c.key, c]));
  const label = (key: string) => byKey.get(key)?.label ?? key;

  const move = (from: number, to: number, refocus = false) => {
    if (from === to || to < 0 || to >= selected.length) {
      return;
    }
    const next = [...selected];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setAnnouncement(t('columns.moved', {name: label(item), position: to + 1}));
    if (refocus) {
      requestAnimationFrame(() => (listRef.current?.children[to] as HTMLElement | undefined)?.focus());
    }
  };
  const add = (key: string) => onChange([...selected, key]);
  const remove = (key: string) => onChange(selected.filter(k => k !== key));

  const q = search.trim().toLocaleLowerCase();
  const matches = (key: string) => !q || label(key).toLocaleLowerCase().includes(q);
  const unselected = available.filter(c => !selected.includes(c.key));
  const addableMatches = q ? unselected.filter(c => matches(c.key)) : [];
  const addItems: Item[] = unselected.map(c => ({
    key: c.key,
    label: c.label,
    description: c.key.startsWith('cf:') ? t('columns.tabCustom') : t('columns.tabStandard'),
    value: c.key
  }));

  return (
    <div className="column-list">
      <Input
        size={Size.FULL}
        icon={searchIcon}
        placeholder={t('columns.search')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        onClear={() => setSearch('')}
        aria-label={t('columns.search')}
      />

      {selected.length === 0 && !q && <div className="empty-hint">{t('columns.empty')}</div>}

      <ul className="column-rows" ref={listRef} aria-label={t('columns.selectedCount', {count: selected.length})} aria-describedby="reorder-hint">
        {selected.map((key, index) => (matches(key) && (
          <li
            key={key}
            tabIndex={0}
            draggable={!q}
            aria-label={`${index + 1}. ${label(key)}`}
            className={[
              'column-row',
              dragIndex === index ? 'column-row--dragging' : '',
              overIndex === index && dragIndex !== index ? 'column-row--over' : ''
            ].join(' ')}
            onKeyDown={e => {
              if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                move(index, index + (e.key === 'ArrowUp' ? -1 : 1), true);
              } else if (e.key === 'Delete') {
                remove(key);
              }
            }}
            onDragStart={e => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={e => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={e => {
              e.preventDefault();
              if (dragIndex !== null) {
                move(dragIndex, index);
              }
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
          >
            <Icon glyph={dragIcon} className="drag-handle"/>
            <span className="column-name">{label(key)}</span>
            <Button
              inline
              icon={closeIcon}
              onClick={() => remove(key)}
              aria-label={`${t('filter.remove')}: ${label(key)}`}
              title={t('filter.remove')}
            />
          </li>
        )))}
        {addableMatches.map(c => (
          <li key={c.key} className="column-row column-row--addable">
            <Button inline icon={addIcon} onClick={() => add(c.key)} aria-label={`${t('columns.add')}: ${c.label}`}>
              {c.label}
            </Button>
          </li>
        ))}
      </ul>
      {q && !addableMatches.length && !selected.some(matches) && <Text info>{t('columns.noMatch')}</Text>}

      {unselected.length > 0 && (
        // Remounted after every pick (key) so it always reads "+ Add columns" again:
        // Ring's Select otherwise keeps showing the last chosen item.
        <Select<{value: string}>
          key={addMenuKey}
          type={Select.Type.INLINE}
          filter
          data={addItems}
          selected={null}
          label={`+ ${t('columns.add')}`}
          onChange={(item: Item | null) => {
            if (item) {
              add(item.value);
              setAddMenuKey(k => k + 1);
            }
          }}
        />
      )}

      <p id="reorder-hint" className="visually-hidden">{t('columns.reorderHint')}</p>
      <div className="visually-hidden" aria-live="polite">{announcement}</div>
    </div>
  );
}
