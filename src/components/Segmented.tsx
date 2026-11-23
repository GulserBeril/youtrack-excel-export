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

import React from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';

interface Option<T extends string> {
  value: T;
  label: string;
  /** Full name for short labels (e.g. ";"): shown as a tooltip and read by screen readers. */
  title?: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Mutually exclusive choice built from Ring UI's ButtonGroup (same control YouTrack uses). */
export function Segmented<T extends string>({options, value, onChange, ariaLabel, className}: Props<T>) {
  return (
    <ButtonGroup role="group" aria-label={ariaLabel} className={className}>
      {options.map(o => (
        <Button
          key={o.value}
          active={o.value === value}
          aria-pressed={o.value === value}
          title={o.title}
          aria-label={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}
