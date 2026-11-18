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
      {name: 'State', value: {name: state}},
      {name: 'Priority', value: {name: PRIORITIES[i % PRIORITIES.length], color: {background: PRIORITY_COLORS[i % PRIORITIES.length]}}},
      {name: 'Type', value: {name: TYPES[i % TYPES.length]}},
      {name: 'Assignee', value: i % 5 === 0 ? null : USERS[i % USERS.length]},
      {name: 'Due Date', value: i % 3 === 0 ? created + 14 * DAY : null},
      {name: 'Story points', value: (i % 8) + 1},
      {name: 'Spent time', value: {minutes: (i % 6) * 45, presentation: `${(i % 6) * 45}m`}}
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

function fieldsFor() {
  const bundle = (values: string[]) => ({values: values.map(name => ({name}))});
  return [
    {field: {name: 'State', fieldType: {valueType: 'state'}}, bundle: bundle(STATES)},
    {field: {name: 'Priority', fieldType: {valueType: 'enum'}}, bundle: bundle(PRIORITIES)},
    {field: {name: 'Type', fieldType: {valueType: 'enum'}}, bundle: bundle(TYPES)},
    {field: {name: 'Assignee', fieldType: {valueType: 'user'}}},
    {field: {name: 'Due Date', fieldType: {valueType: 'date'}}},
    {field: {name: 'Story points', fieldType: {valueType: 'integer'}}},
    {field: {name: 'Spent time', fieldType: {valueType: 'period'}}}
  ];
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
  if (/^admin\/projects\/.+\/customFields$/.test(url)) {
    return delay(fieldsFor());
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
