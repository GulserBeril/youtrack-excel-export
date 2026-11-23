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

import type {HostAPI} from '../../@types/globals';
import {quote} from './query';
import type {FieldMeta, Project, RawIssue, SavedQuery, UserRef} from './types';

/**
 * Thin wrapper around the YouTrack REST API, called through the app host
 * (`host.fetchYouTrack`). Requests run with the current user's permissions,
 * so users only ever see and export issues they are allowed to read.
 */

const ISSUE_FIELDS = [
  'idReadable',
  'summary',
  'description',
  'created',
  'updated',
  'resolved',
  'project(shortName,name)',
  'reporter(login,fullName)',
  'tags(name)',
  'customFields(name,$type,value(name,login,fullName,presentation,minutes,text,color(background,foreground)))'
].join(',');

const PAGE_SIZE = 100;

interface ProjectCustomField {
  id: string;
  field: {name: string; fieldType?: {valueType?: string; isMultiValue?: boolean}};
  bundle?: {values?: {name: string; archived?: boolean}[]; aggregatedUsers?: UserRef[]};
}

/** An issue with only the definitions of its project's custom fields (see fieldsFromIssues). */
interface IssueFieldDefinitions {
  customFields?: {projectCustomField?: ProjectCustomField | null}[];
}

/** How many issues are read to collect the project's field definitions when the admin API is not available. */
const FIELD_SAMPLE_ISSUES = 10;

const toFieldMeta = (pcf: ProjectCustomField): FieldMeta => ({
  name: pcf.field.name,
  valueType: pcf.field.fieldType?.valueType ?? 'string',
  multiValue: Boolean(pcf.field.fieldType?.isMultiValue),
  values: (pcf.bundle?.values ?? []).filter(v => !v.archived).map(v => v.name)
});

export interface SearchAssistSuggestion {
  option: string;
  /** Text YouTrack inserts before the option (e.g. "#"). */
  prefix?: string;
  /** Text YouTrack inserts after the option (e.g. ": " after a field name, " " after a value). */
  suffix?: string;
  description: string;
  group: string;
  caret: number;
  completionStart: number;
  completionEnd: number;
  matchingStart: number;
  matchingEnd: number;
}

export interface SearchAssistResponse {
  query?: string;
  caret?: number;
  suggestions?: SearchAssistSuggestion[];
}

interface UserBundleField {
  bundle?: {aggregatedUsers?: UserRef[]};
}

export function createYouTrackApi(host: HostAPI) {
  const get = <T>(url: string, query?: Record<string, string | number>) =>
    host.fetchYouTrack<T>(url, query ? {query} : undefined);

  /**
   * Field definitions of a project for users who cannot use the admin API: every issue lists all custom
   * fields of its project (empty ones too) together with the project field settings and value bundles.
   * A few issues are read and merged so that values from all of them are included.
   * A project without issues yields no custom fields (there is nothing to export then anyway).
   */
  const fieldsFromIssues = async (project: Project): Promise<FieldMeta[]> => {
    const issues = await get<IssueFieldDefinitions[]>('issues', {
      query: `project: ${quote(project.shortName)}`,
      fields: 'customFields(projectCustomField(id,field(name,fieldType(valueType,isMultiValue)),' +
        'bundle(values(name,archived),aggregatedUsers(login,fullName))))',
      $top: FIELD_SAMPLE_ISSUES
    });
    const byName = new Map<string, FieldMeta>();
    for (const issue of issues) {
      for (const cf of issue.customFields ?? []) {
        const pcf = cf.projectCustomField;
        if (!pcf?.field?.name) {
          continue;
        }
        const meta = toFieldMeta(pcf);
        const users = pcf.bundle?.aggregatedUsers;
        const known = byName.get(meta.name);
        if (!known) {
          byName.set(meta.name, {...meta, users: users?.length ? users : undefined});
          continue;
        }
        known.values = [...new Set([...known.values, ...meta.values])];
        if (!known.users?.length && users?.length) {
          known.users = users;
        }
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  return {
    getProjects: async (): Promise<Project[]> => {
      const projects = await get<Project[]>('admin/projects', {
        fields: 'id,shortName,name,archived',
        $top: -1
      });
      return projects.filter(p => !p.archived);
    },

    /**
     * Custom fields of one project. Filters and columns are always built for the selected
     * project, because every project can have its own fields and values.
     * For user fields (e.g. Assignee) the users who can be set in this project are loaded too.
     */
    getFieldsForProject: async (project: Project): Promise<FieldMeta[]> => {
      // Project administrators can read the project's field settings directly. For everybody else
      // (e.g. the Contributor role) this call fails or returns an empty list, so the field definitions
      // are then read from the project's issues, which every user who can see the issues may read.
      let list: ProjectCustomField[] = [];
      try {
        list = await get<ProjectCustomField[]>(`admin/projects/${project.id}/customFields`, {
          fields: 'id,field(name,fieldType(valueType,isMultiValue)),bundle(values(name,archived))',
          $top: -1
        });
      } catch {
        list = [];
      }
      if (!list.length) {
        return fieldsFromIssues(project);
      }
      const fields = await Promise.all(list.map(async (pcf): Promise<FieldMeta> => {
        const meta = toFieldMeta(pcf);
        if (meta.valueType === 'user') {
          try {
            const detail = await get<UserBundleField>(`admin/projects/${project.id}/customFields/${pcf.id}`, {
              fields: 'bundle(aggregatedUsers(login,fullName))'
            });
            meta.users = detail.bundle?.aggregatedUsers;
          } catch {
            // Bundle not readable: the user filter falls back to a global user search.
          }
        }
        return meta;
      }));
      return fields.sort((a, b) => a.name.localeCompare(b.name));
    },

    searchUsers: (text: string): Promise<UserRef[]> =>
      get<UserRef[]>('users', {query: text, fields: 'login,fullName', $top: 20}),

    getTags: async (): Promise<string[]> => {
      const tags = await get<{name: string}[]>('tags', {fields: 'name', $top: -1});
      return tags.map(t => t.name);
    },

    getSavedQueries: (): Promise<SavedQuery[]> =>
      get<SavedQuery[]>('savedQueries', {fields: 'id,name,query', $top: -1}),

    /**
     * Returns the number of issues matching the query.
     * YouTrack answers -1 while it is still counting, so we retry a few times.
     */
    countIssues: async (query: string, signal?: {cancelled: boolean}): Promise<number | null> => {
      for (let attempt = 0; attempt < 10; attempt++) {
        if (signal?.cancelled) {
          return null;
        }
        const res = await host.fetchYouTrack<{count: number}>('issuesGetter/count', {
          method: 'POST',
          query: {fields: 'count'},
          body: {query}
        });
        if (res.count >= 0) {
          return res.count;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return null;
    },

    /**
     * Completion for the query box, from YouTrack's own search assist (the same suggestions as the
     * search bar in the issue list). Scoped to the selected project through `folders`.
     * Requests the Suggestion fields YouTrack's own search box needs to insert a suggestion correctly:
     * prefix and suffix (e.g. option "State" + suffix ": "). Without them a picked suggestion is
     * inserted incomplete. Icons are left out: their URIs are relative to YouTrack and break in the iframe.
     */
    searchAssist: (query: string, caret: number, projectId?: string): Promise<SearchAssistResponse> =>
      host.fetchYouTrack<SearchAssistResponse>('search/assist', {
        method: 'POST',
        query: {fields: 'query,caret,suggestions(option,prefix,suffix,description,group,caret,completionStart,completionEnd,matchingStart,matchingEnd)'},
        body: {query, caret, folders: projectId ? [{id: projectId, $type: 'Project'}] : []}
      }),

    /** First few issues for the on-page preview. */
    fetchPreview: (query: string, top = 5): Promise<RawIssue[]> =>
      get<RawIssue[]>('issues', {query, fields: ISSUE_FIELDS, $top: top}),

    /** Fetches every issue matching the query, page by page. */
    fetchAllIssues: async (
      query: string,
      onProgress?: (loaded: number) => void,
      maxIssues = 50000
    ): Promise<RawIssue[]> => {
      const all: RawIssue[] = [];
      for (let skip = 0; skip < maxIssues; skip += PAGE_SIZE) {
        const page = await get<RawIssue[]>('issues', {
          query,
          fields: ISSUE_FIELDS,
          $top: PAGE_SIZE,
          $skip: skip
        });
        all.push(...page);
        onProgress?.(all.length);
        if (page.length < PAGE_SIZE) {
          break;
        }
      }
      return all;
    }
  };
}

export type YouTrackApi = ReturnType<typeof createYouTrackApi>;
