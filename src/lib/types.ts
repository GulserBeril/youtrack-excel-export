/** Shared types for the Issue Export app. */

export interface Project {
  id: string;
  shortName: string;
  name: string;
  archived?: boolean;
}

/** Base value types reported by YouTrack in `fieldType.valueType`. */
export type ValueType =
  | 'enum' | 'state' | 'user' | 'ownedField' | 'version' | 'build' | 'group'
  | 'date' | 'date and time' | 'integer' | 'float' | 'period'
  | 'string' | 'text' | string;

/** A custom field merged across all selected projects. */
export interface FieldMeta {
  name: string;
  valueType: ValueType;
  multiValue: boolean;
  /** Bundle values (enum, state, version, ...). Empty for user/date/number/text fields. */
  values: string[];
}

export type FilterKind = 'values' | 'users' | 'range' | 'text';

export interface FieldFilter {
  field: string;
  kind: FilterKind;
  /** For kind 'values' / 'users': selected value names or user logins. */
  values: string[];
  /** For kind 'range': inclusive bounds (YYYY-MM-DD for dates, numbers or periods like "1d" otherwise). */
  from?: string;
  to?: string;
  /** For kind 'text'. */
  text?: string;
}

export interface DateRange {
  from?: string;
  to?: string;
}

export type ResolvedFilter = 'any' | 'unresolved' | 'resolved';

export interface Filters {
  projects: string[]; // project short names
  resolved: ResolvedFilter;
  created: DateRange;
  updated: DateRange;
  tags: string[];
  fieldFilters: FieldFilter[];
  text: string;
}

export const EMPTY_FILTERS: Filters = {
  projects: [],
  resolved: 'any',
  created: {},
  updated: {},
  tags: [],
  fieldFilters: [],
  text: ''
};

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
}

export interface UserRef {
  login: string;
  fullName?: string;
}

/** Raw issue as returned by /api/issues with the fields requested in youtrack.ts. */
export interface RawIssue {
  idReadable: string;
  summary?: string;
  description?: string | null;
  created?: number;
  updated?: number;
  resolved?: number | null;
  project?: {shortName: string; name: string};
  reporter?: UserRef | null;
  tags?: {name: string}[];
  customFields?: RawCustomField[];
}

export interface RawCustomField {
  name: string;
  $type?: string;
  value: unknown;
}

export interface ColumnDef {
  /** Unique key: built-in id (e.g. "summary") or "cf:<field name>". */
  key: string;
  label: string;
  /** Excel-side type, used for cell formatting. */
  type: 'text' | 'number' | 'date';
  width?: number;
}
