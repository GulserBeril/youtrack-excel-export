import React, {useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import Input, {Size} from '@jetbrains/ring-ui-built/components/input/input';
import {Tab, Tabs} from '@jetbrains/ring-ui-built/components/tabs/tabs';
import Text from '@jetbrains/ring-ui-built/components/text/text';

import {DEFAULT_COLUMN_KEYS} from '../lib/columns';
import {useT} from '../lib/i18n';
import {closeIcon, dragIcon, resetIcon, searchIcon} from '../lib/icons';
import type {ColumnDef} from '../lib/types';

type ColumnTab = 'standard' | 'custom' | 'all';

interface Props {
  available: ColumnDef[];
  selected: string[];
  onChange: (keys: string[]) => void;
}

/**
 * Two panes: every field as a searchable checklist on the left,
 * the selected columns in file order on the right (drag, or Alt+↑/↓ on a focused row).
 */
export function ColumnPicker({available, selected, onChange}: Props) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ColumnTab>('standard');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLOListElement>(null);

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
  const toggle = (key: string, on: boolean) =>
    onChange(on ? [...selected, key] : selected.filter(k => k !== key));

  // "Reset order" keeps the same columns but puts them back in the default order:
  // the default columns first (ID, Summary, State, ...), then any others in field-list order.
  const order = new Map(available.map((c, i) => {
    const preferred = DEFAULT_COLUMN_KEYS.indexOf(c.key);
    return [c.key, preferred >= 0 ? preferred : DEFAULT_COLUMN_KEYS.length + i];
  }));
  const resetOrder = () => onChange([...selected].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
  const isDefaultOrder = selected.every((k, i) => i === 0 || (order.get(selected[i - 1]) ?? 0) <= (order.get(k) ?? 0));

  const q = search.trim().toLocaleLowerCase();
  const groups = [
    {id: 'standard', title: t('columns.builtIn'), items: available.filter(c => !c.key.startsWith('cf:'))},
    {id: 'custom', title: t('columns.custom'), items: available.filter(c => c.key.startsWith('cf:'))}
  ]
    .filter(g => tab === 'all' || g.id === tab)
    .map(g => ({...g, items: g.items.filter(c => !q || c.label.toLocaleLowerCase().includes(q))}))
    .filter(g => g.items.length);

  return (
    <div className="column-picker">
      <div className="column-search">
        <Input
          size={Size.FULL}
          icon={searchIcon}
          placeholder={t('columns.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          aria-label={t('columns.search')}
        />
      </div>
      <div className="column-source">
        <Tabs selected={tab} onSelect={key => setTab(key as ColumnTab)} className="column-tabs">
          <Tab id="standard" title={t('columns.tabStandard')}/>
          <Tab id="custom" title={t('columns.tabCustom')}/>
          <Tab id="all" title={t('columns.tabAll')}/>
        </Tabs>
        <div className="column-checklist">
          {groups.length === 0 && <Text info>{t('columns.noMatch')}</Text>}
          {groups.map(g => (
            <div key={g.title} className="column-group">
              {tab === 'all' && <Text info size={Text.Size.S} className="group-title">{g.title}</Text>}
              {g.items.map(c => (
                <Checkbox
                  key={c.key}
                  label={c.label}
                  checked={selected.includes(c.key)}
                  onChange={e => toggle(c.key, e.target.checked)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="column-target">
        <div className="column-target-header">
          <Text id="selected-columns-title" bold>{t('columns.selectedCount', {count: selected.length})}</Text>
          <Button inline icon={resetIcon} onClick={resetOrder} disabled={selected.length < 2 || isDefaultOrder}>
            {t('columns.resetOrder')}
          </Button>
        </div>

        {selected.length === 0
          ? <div className="empty-hint">{t('columns.empty')}</div>
          : (
            <ol className="column-order" ref={listRef} aria-labelledby="selected-columns-title" aria-describedby="reorder-hint">
              {selected.map((key, index) => (
                <li
                  key={key}
                  tabIndex={0}
                  draggable
                  aria-label={`${index + 1}. ${label(key)}`}
                  className={[
                    'column-chip',
                    dragIndex === index ? 'column-chip--dragging' : '',
                    overIndex === index && dragIndex !== index ? 'column-chip--over' : ''
                  ].join(' ')}
                  onKeyDown={e => {
                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault();
                      move(index, index + (e.key === 'ArrowUp' ? -1 : 1), true);
                    } else if (e.key === 'Delete') {
                      toggle(key, false);
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
                  <span className="column-index">{`${index + 1}.`}</span>
                  <span className="column-name">{label(key)}</span>
                  <Button
                    inline
                    icon={closeIcon}
                    onClick={() => toggle(key, false)}
                    aria-label={`${t('filter.remove')}: ${label(key)}`}
                    title={t('filter.remove')}
                  />
                </li>
              ))}
            </ol>
          )}
        <p id="reorder-hint" className="visually-hidden">{t('columns.reorderHint')}</p>
        <div className="visually-hidden" aria-live="polite">{announcement}</div>
      </div>
    </div>
  );
}
