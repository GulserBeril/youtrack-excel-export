import type {HostAPI} from '../../@types/globals';
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
  bundle?: {values?: {name: string; archived?: boolean}[]};
}

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
      const list = await get<ProjectCustomField[]>(`admin/projects/${project.id}/customFields`, {
        fields: 'id,field(name,fieldType(valueType,isMultiValue)),bundle(values(name,archived))',
        $top: -1
      });
      const fields = await Promise.all(list.map(async (pcf): Promise<FieldMeta> => {
        const valueType = pcf.field.fieldType?.valueType ?? 'string';
        const meta: FieldMeta = {
          name: pcf.field.name,
          valueType,
          multiValue: Boolean(pcf.field.fieldType?.isMultiValue),
          values: (pcf.bundle?.values ?? []).filter(v => !v.archived).map(v => v.name)
        };
        if (valueType === 'user') {
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
