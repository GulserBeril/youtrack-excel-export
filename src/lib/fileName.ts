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

import type {RawIssue} from './types';

/** How many project names are spelled out before the rest are summarised as "+N". */
const MAX_NAMED_PROJECTS = 3;
const MAX_BASE_LENGTH = 120;

/** Removes characters that Windows, macOS or Linux do not allow in file names. */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/]/g, '-')
    .replace(/[:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    .trim();
}

/** Distinct project names of the exported issues, in order of first appearance. */
export function projectNames(issues: RawIssue[]): string[] {
  const names: string[] = [];
  for (const issue of issues) {
    const name = issue.project?.name || issue.project?.shortName;
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Builds the download name from the projects the exported issues belong to:
 *   one project      -> "Web Sitesi 2026-11-17.xlsx"
 *   up to three      -> "Web Sitesi + Mobil 2026-11-17.xlsx"
 *   more than three  -> "Web Sitesi + Mobil + API +2 2026-11-17.xlsx"
 *   no project info  -> "YouTrack 2026-11-17.xlsx"
 * The extension follows the chosen format (xlsx or csv).
 */
export function exportFileName(issues: RawIssue[], extension = 'xlsx', date = new Date()): string {
  const names = projectNames(issues);
  let base = names.slice(0, MAX_NAMED_PROJECTS).join(' + ');
  if (names.length > MAX_NAMED_PROJECTS) {
    base += ` +${names.length - MAX_NAMED_PROJECTS}`;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${sanitizeFileName(base) || 'YouTrack'} ${y}-${m}-${d}.${extension}`;
}
