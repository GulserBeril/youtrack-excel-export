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
