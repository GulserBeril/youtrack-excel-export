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
  field: {name: string; fieldType?: {valueType?: string; isMultiValue?: boolean}};
  bundle?: {values?: {name: string; archived?: boolean}[]};
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

    /** Loads custom fields of the given projects and merges them by name. */
    getFieldsForProjects: async (projects: Project[]): Promise<FieldMeta[]> => {
      const byName = new Map<string, FieldMeta>();
      const lists = await Promise.all(projects.map(p =>
        get<ProjectCustomField[]>(`admin/projects/${p.id}/customFields`, {
          fields: 'field(name,fieldType(valueType,isMultiValue)),bundle(values(name,archived))',
          $top: -1
        })
      ));
      for (const pcf of lists.flat()) {
        const name = pcf.field.name;
        const values = (pcf.bundle?.values ?? []).filter(v => !v.archived).map(v => v.name);
        const existing = byName.get(name);
        if (existing) {
          existing.values = Array.from(new Set([...existing.values, ...values]));
          existing.multiValue = existing.multiValue || Boolean(pcf.field.fieldType?.isMultiValue);
        } else {
          byName.set(name, {
            name,
            valueType: pcf.field.fieldType?.valueType ?? 'string',
            multiValue: Boolean(pcf.field.fieldType?.isMultiValue),
            values
          });
        }
      }
      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
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
