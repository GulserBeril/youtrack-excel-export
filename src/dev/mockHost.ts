/**
 * Local preview only (not part of the build): a fake YTApp host that answers the
 * YouTrack REST calls made by the app with generated sample data.
 * Open http://localhost:5173/dev/preview.html (add ?lang=en for English, ?theme=dark for the dark theme).
 */

const PROJECTS = [
  {id: '0-1', shortName: 'WEB', name: 'Web Sitesi'},
  {id: '0-2', shortName: 'MOB', name: 'Mobil Uygulama'},
  {id: '0-3', shortName: 'API', name: 'Backend API'}
];
const STATES = ['Open', 'In Progress', 'To Verify', 'Fixed', 'Done'];
const PRIORITIES = ['Show-stopper', 'Critical', 'Major', 'Normal', 'Minor'];
// Sample bundle colors, standing in for the colors YouTrack returns with field values (dev only).
const STATE_COLORS: Record<string, {background: string; foreground: string}> = {
  Open: {background: '#3d4247', foreground: '#dfe1e5'},
  'In Progress': {background: '#25324d', foreground: '#8ab4f8'},
  'To Verify': {background: '#3d3223', foreground: '#f2c55c'},
  Fixed: {background: '#253627', foreground: '#5fb865'},
  Done: {background: '#253627', foreground: '#5fb865'}
};
const PRIORITY_COLORS = ['#e30000', '#e85c00', '#e0a800', '#3d8bfd', '#8f9bb3'];
const TYPES = ['Bug', 'Feature', 'Task'];
const USERS = [
  {login: 'ayse', fullName: 'Ayşe Yılmaz'},
  {login: 'mehmet', fullName: 'Mehmet Demir'},
  {login: 'zeynep', fullName: 'Zeynep Kaya'},
  {login: 'can', fullName: 'Can Öztürk'}
];
const TAGS = ['needs review', 'regression', 'customer'];

const DAY = 86400000;
const now = Date.now();

const ISSUES = Array.from({length: 137}, (_, i) => {
  const project = PROJECTS[i % 3];
  const state = STATES[i % STATES.length];
  const created = now - (i * 2 + 3) * DAY;
  return {
    idReadable: `${project.shortName}-${100 + i}`,
    summary: `${['Giriş', 'Ödeme', 'Bildirim', 'Profil', 'Arama'][i % 5]} ekranında ${['hata', 'iyileştirme', 'yeni alan'][i % 3]} #${i + 1}`,
    description: 'Örnek açıklama metni.',
    created,
    updated: created + DAY,
    resolved: state === 'Done' || state === 'Fixed' ? created + 2 * DAY : null,
    project: {shortName: project.shortName, name: project.name},
    reporter: USERS[(i + 1) % USERS.length],
    tags: i % 4 === 0 ? [{name: TAGS[i % 3]}] : [],
    customFields: [
      {name: 'State', value: {name: state, color: STATE_COLORS[state]}},
      {name: 'Priority', value: {name: PRIORITIES[i % PRIORITIES.length], color: {background: PRIORITY_COLORS[i % PRIORITIES.length]}}},
      {name: 'Type', value: {name: TYPES[i % TYPES.length]}},
      {name: 'Assignee', value: i % 5 === 0 ? null : USERS[i % USERS.length]},
      {name: 'Due Date', value: i % 3 === 0 ? created + 14 * DAY : null},
      {name: 'Story points', value: (i % 8) + 1},
      {name: 'Spent time', value: {minutes: (i % 6) * 45, presentation: `${(i % 6) * 45}m`}},
      {name: 'Platform', value: {name: ['iOS', 'Android'][i % 2]}},
      {name: 'Component', value: {name: ['Auth', 'Billing', 'Search'][i % 3]}}
    ]
  };
});

/** Very small subset of the query language, enough to make counts react to filters. */
function matches(issue: (typeof ISSUES)[number], query: string): boolean {
  const project = /project: ([^#]+?)(?= [A-Z{#]|$)/.exec(query);
  if (project) {
    const names = project[1].split(',').map(s => s.trim());
    if (!names.includes(issue.project.shortName)) {
      return false;
    }
  }
  if (query.includes('#Unresolved') && issue.resolved) {
    return false;
  }
  if (query.includes('#Resolved') && !issue.resolved) {
    return false;
  }
  const state = /State: ((?:\{[^}]+\}|[^\s,{]+)(?:, (?:\{[^}]+\}|[^\s,{]+))*)/.exec(query);
  if (state) {
    const values = state[1].split(', ').map(s => s.replace(/[{}]/g, ''));
    const value = (issue.customFields[0].value as {name: string}).name;
    if (!values.includes(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Every project has its own fields (like in real YouTrack):
 *   WEB: the full set · MOB: adds Platform, has no Type · API: adds Component, has no Priority.
 * Each project also has its own assignable users.
 */
const PROJECT_FIELDS: Record<string, string[]> = {
  '0-1': ['State', 'Priority', 'Type', 'Assignee', 'Due Date', 'Story points', 'Spent time'],
  '0-2': ['State', 'Priority', 'Assignee', 'Platform', 'Story points'],
  '0-3': ['State', 'Type', 'Assignee', 'Component', 'Due Date']
};
const PROJECT_USERS: Record<string, string[]> = {
  '0-1': ['ayse', 'mehmet', 'zeynep', 'can'],
  '0-2': ['ayse', 'zeynep'],
  '0-3': ['mehmet', 'can']
};

function fieldsFor(projectId: string) {
  const bundle = (values: string[]) => ({values: values.map(name => ({name}))});
  const all = [
    {field: {name: 'State', fieldType: {valueType: 'state'}}, bundle: bundle(STATES)},
    {field: {name: 'Priority', fieldType: {valueType: 'enum'}}, bundle: bundle(PRIORITIES)},
    {field: {name: 'Type', fieldType: {valueType: 'enum'}}, bundle: bundle(TYPES)},
    {field: {name: 'Assignee', fieldType: {valueType: 'user'}}},
    {field: {name: 'Due Date', fieldType: {valueType: 'date'}}},
    {field: {name: 'Story points', fieldType: {valueType: 'integer'}}},
    {field: {name: 'Spent time', fieldType: {valueType: 'period'}}},
    {field: {name: 'Platform', fieldType: {valueType: 'enum'}}, bundle: bundle(['iOS', 'Android'])},
    {field: {name: 'Component', fieldType: {valueType: 'enum'}}, bundle: bundle(['Auth', 'Billing', 'Search'])}
  ];
  const names = PROJECT_FIELDS[projectId] ?? PROJECT_FIELDS['0-1'];
  return all
    .filter(f => names.includes(f.field.name))
    .map(f => ({...f, id: `${projectId}:${f.field.name}`}));
}

/**
 * A tiny stand-in for YouTrack's search assist: completes the word at the caret with
 * field names ("State: "), values of the field being typed ("State: Op" -> "Open") and a few
 * keywords. Real YouTrack does much more; this only lets the query box be tried locally.
 */
interface AssistBody {
  query: string;
  caret: number;
  folders?: {id: string}[];
}

function assist({query, caret, folders}: AssistBody) {
  const projectId = folders?.[0]?.id ?? '0-1';
  const fields = fieldsFor(projectId);
  const before = query.slice(0, caret);
  const wordStart = Math.max(before.lastIndexOf(' '), before.lastIndexOf(',')) + 1;
  const word = before.slice(wordStart).toLowerCase();
  const fieldBefore = /([A-Za-z ]+):\s*(?:[^:]*,\s*)?[^:,]*$/.exec(before)?.[1]?.trim().split(' ').pop();
  const meta = fields.find(f => f.field.name.toLowerCase() === fieldBefore?.toLowerCase());

  let options: {option: string; description: string; group: string}[];
  if (meta && 'bundle' in meta && meta.bundle) {
    options = meta.bundle.values.map(v => ({option: v.name.includes(' ') ? `{${v.name}}` : v.name, description: meta.field.name, group: 'Values'}));
  } else if (meta?.field.name === 'Assignee') {
    const logins = PROJECT_USERS[projectId] ?? [];
    options = ['me', ...logins].map(l => ({option: l, description: 'User', group: 'Users'}));
  } else {
    options = [
      ...fields.map(f => ({option: `${f.field.name.includes(' ') ? `{${f.field.name}}` : f.field.name}: `, description: 'Field', group: 'Fields'})),
      {option: '#Unresolved', description: 'Unresolved issues', group: 'Keywords'},
      {option: '#Resolved', description: 'Resolved issues', group: 'Keywords'},
      {option: 'created: ', description: 'Creation date', group: 'Fields'},
      {option: 'updated: ', description: 'Last update', group: 'Fields'},
      {option: 'tag: ', description: 'Tag', group: 'Fields'}
    ];
  }
  const matching = options.filter(o => o.option.toLowerCase().startsWith(word)).slice(0, 12);
  return {
    query,
    caret,
    suggestions: matching.map(o => ({
      ...o,
      completionStart: wordStart,
      completionEnd: caret,
      matchingStart: 0,
      matchingEnd: word.length,
      caret: wordStart + o.option.length
    }))
  };
}

const delay = <T>(value: T, ms = 150) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms));

interface Params {
  query?: Record<string, string | number>;
  body?: {query?: string};
}

async function fetchYouTrack(url: string, params: Params = {}): Promise<unknown> {
  const q = params.query ?? {};
  if (url === 'admin/projects') {
    return delay(PROJECTS);
  }
  const fieldList = /^admin\/projects\/([^/]+)\/customFields$/.exec(url);
  if (fieldList) {
    return delay(fieldsFor(fieldList[1]));
  }
  // One project field: the user bundle of a user field (assignable users of that project).
  const fieldDetail = /^admin\/projects\/([^/]+)\/customFields\/(.+)$/.exec(url);
  if (fieldDetail) {
    const logins = PROJECT_USERS[fieldDetail[1]] ?? [];
    return delay({bundle: {aggregatedUsers: USERS.filter(u => logins.includes(u.login))}});
  }
  if (url === 'users') {
    const text = String(q.query ?? '').toLowerCase();
    return delay(USERS.filter(u => u.fullName.toLowerCase().includes(text) || u.login.includes(text)));
  }
  if (url === 'tags') {
    return delay(TAGS.map(name => ({name})));
  }
  if (url === 'savedQueries') {
    return delay([
      {id: 's1', name: 'Açık hatalarım', query: 'Type: Bug #Unresolved Assignee: me'},
      {id: 's2', name: 'Web — bu sprint', query: 'project: WEB State: {In Progress}'}
    ]);
  }
  if (url === 'search/assist') {
    return delay(assist(params.body as AssistBody), 80);
  }
  if (url === 'issuesGetter/count') {
    const query = params.body?.query ?? '';
    return delay({count: ISSUES.filter(i => matches(i, query)).length}, 300);
  }
  if (url === 'issues') {
    const query = String(q.query ?? '');
    const skip = Number(q.$skip ?? 0);
    const top = Number(q.$top ?? 100);
    return delay(ISSUES.filter(i => matches(i, query)).slice(skip, skip + top), 250);
  }
  throw new Error(`Mock host: unhandled URL ${url}`);
}

const params = new URLSearchParams(location.search);
const lang = params.get('lang') ?? 'tr';

// Stands in for YouTrack handing its theme to the iframe: ?theme=dark adds Ring UI's dark theme class.
// ?themeOn=body puts the class on <body> instead of <html> (to test pages where the host themes an inner element).
if (params.get('theme') === 'dark') {
  const target = params.get('themeOn') === 'body' ? document.body : document.documentElement;
  target.classList.add('ring-ui-theme-dark');
}

(window as unknown as {YTApp: unknown}).YTApp = {
  locale: lang,
  register: async () => ({
    fetchYouTrack,
    fetchApp: async () => ({}),
    alert: (message: string) => console.info('[host.alert]', message),
    enterModalMode: async () => undefined,
    exitModalMode: async () => undefined,
    collapse: () => undefined,
    closeWidget: () => undefined
  })
};
