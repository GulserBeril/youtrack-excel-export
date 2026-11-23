# YouTrack Issue Export

A YouTrack app that filters issues and exports them to **Excel (.xlsx)** or **CSV**.
It adds a separate **Issue Export** page to the YouTrack main menu (`MAIN_MENU_ITEM`). Developed by [Codeo](https://www.codeo.com.tr/).

> The technical ID in the manifest (`"name": "excel-export"`) is intentionally unchanged: YouTrack uses it to recognize
> new versions and update the existing installation. Changing it would install a separate app.

## Features

The page follows the language of the YouTrack user (English or Turkish).

- **Theme:** the page follows the theme selected in YouTrack, not the operating system theme. The app makes no theme
  decision of its own; it uses the Ring UI variables YouTrack provides to the iframe.
- **Native look:** every control is a Ring UI component and every color comes from the `--ring-*` variables; icons come
  from `@jetbrains/icons`. State tags and color dots in the preview use the colors YouTrack returns for those values.

The page is used step by step:

1. **Issue filters**
   - Choose exactly one project (required). Everything else is limited to that project.
   - Filter with a search bar that works like the one in the YouTrack issue list:
     - **+** opens the project's fields. A picked field becomes a "Field is" chip and its value list opens
       (multi-select with search; user fields offer Unassigned and Me).
     - **Typing** suggests matching fields and values (e.g. `fix` → State: Fixed); `State: ` limits suggestions to that
       field. The last row searches for the typed text.
     - Several values of one field mean any of them; different fields are combined.
     - Keyboard: ↑/↓, Enter, Esc; Backspace in an empty bar removes the last condition. The search button on the right
       applies the typed text, × clears everything.
   - Changing the project resets the filters and the column selection.
2. **Columns:** the selected columns in file order (drag, or Alt+↑/↓ on a focused row; × removes), a search box and an
   "Add columns" menu.
3. **Preview:** the first 5 matching issues with the selected columns.
4. **Export Summary:** issue and column count, file format (CSV also has a separator choice), Download and Reset.

The columns, preview and export steps stay inactive (`inert`) until a project is chosen.

### File formats

| Format | Content |
|---|---|
| Excel (.xlsx) | Bold, frozen header row, auto filter, real date cells, and an export info sheet |
| CSV | UTF-8 with BOM (so Excel shows non-ASCII characters correctly). Separator `;` (default for Turkish) or `,` (default for English). Values starting with `=`, `+`, `-` or `@` are prefixed with `'` (CSV injection protection) |

The last chosen format and separator are remembered in the browser. Files are named `Project Name YYYY-MM-DD.<ext>`.
Files are generated entirely in the browser; no data leaves YouTrack.

## Local preview (without uploading to YouTrack)

```bash
npm run dev
```

Open `http://localhost:5173/dev/preview.html` (`?lang=en` for English, `?theme=dark` to imitate the YouTrack dark theme).
The fake YouTrack data lives in `src/dev/mockHost.ts`; these files are not part of the build or the zip.

Check the look on a **production build** before uploading (the dev server orders CSS differently):

```bash
npm run preview:prod
```

Then open `http://localhost:5174/dev/preview.html` (dark theme: `?theme=dark&themeOn=body`).

## Project structure

```
manifest.json                  App definition (widget, extension point, permissions)
src/widgets/export-page/       The page (app.tsx), entry point, CSS, menu icon
src/components/FilterBar.tsx   YouTrack-style filter bar (chips, typing suggestions)
src/components/ColumnList.tsx  Column selection and order
src/components/PreviewTable.tsx
src/components/Segmented.tsx   Format / separator switch
src/lib/query.ts               Filters → YouTrack query language
src/lib/youtrack.ts            REST API calls (paging, count, project fields)
src/lib/columns.ts             Column definitions and value conversion
src/lib/exporters.ts           CSV generation, download, format choice
src/lib/excel.ts               .xlsx generation with ExcelJS (loaded only when exporting to Excel)
src/lib/fileName.ts            File name from the project name
src/lib/i18n.ts                English / Turkish texts
src/dev/                       Local preview (fake YouTrack host)
@types/globals.d.ts            YTApp host API types (from the official template)
```

## Development

```bash
npm install
npm run build        # type check + vite build + manifest validation → dist/
```

## Uploading to YouTrack

1. In YouTrack, create a token with the *YouTrack* scope: **Profile → Account Security → New token**.
2. Copy `.env.example` to `.env`, fill in `YOUTRACK_HOST` and `YOUTRACK_TOKEN`, then run:
   ```bash
   npm run deploy      # build + upload
   ```
3. Enable the app under **Administration → Apps → Issue Export** (Active).
4. The **Issue Export** page appears in the main menu.

Package for manual upload or the Marketplace: `npm run pack` → `youtrack-issue-export.zip`
(builds and puts the contents of `dist` at the root of the zip). Upload it in YouTrack under
**Administration → Apps → Add app → Upload ZIP file**.

## Release history

Earlier designs are kept as git tags: `v0.8.5-design-a`, `v0.9.0-design-b`, `v0.9.7-design-b2`, `v0.10.x`/`v0.11.0-design-c`.

## License

Apache License 2.0, see [LICENSE](LICENSE). Copyright and third-party components: [NOTICE](NOTICE).
