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

import React, {useState} from 'react';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import type {SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import DatePicker from '@jetbrains/ring-ui-built/components/date-picker/date-picker';
import type {DatePickerChange} from '@jetbrains/ring-ui-built/components/date-picker/consts';
import {Size} from '@jetbrains/ring-ui-built/components/input/input';

import {DATE_PRESETS, detectPreset, presetRange} from '../lib/dates';
import type {DatePreset} from '../lib/dates';
import {useT} from '../lib/i18n';
import type {MessageKey} from '../lib/i18n';
import {fromQueryDate, toQueryDate} from '../lib/query';
import type {DateRange} from '../lib/types';

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

type Item = SelectItem<{value: DatePreset}>;

/** Date range filter: common presets in a dropdown, a calendar only when "Custom" is picked. */
export function DateRangeFilter({value, onChange}: Props) {
  const t = useT();
  const detected = detectPreset(value);
  const [customOpen, setCustomOpen] = useState(detected === 'custom');
  const current: DatePreset = customOpen ? 'custom' : detected;

  const items: Item[] = [...DATE_PRESETS, 'custom' as const].map(p => ({
    key: p,
    label: t(`date.${p}` as MessageKey),
    value: p
  }));

  const select = (item: Item | null) => {
    if (!item) {
      return;
    }
    if (item.value === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(presetRange(item.value));
  };

  return (
    <div className="date-filter">
      <Select<{value: DatePreset}>
        size={Size.FULL}
        data={items}
        selected={items.find(i => i.value === current)}
        onChange={select}
      />
      {current === 'custom' && (
        <DatePicker
          range
          clear
          from={fromQueryDate(value.from)}
          to={fromQueryDate(value.to)}
          onChange={({from, to}: DatePickerChange) => onChange({from: toQueryDate(from), to: toQueryDate(to)})}
        />
      )}
    </div>
  );
}
