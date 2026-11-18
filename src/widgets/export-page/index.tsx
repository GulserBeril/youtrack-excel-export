import React from 'react';
import ReactDOM from 'react-dom/client';
import {ControlsHeightContext, ControlsHeight} from '@jetbrains/ring-ui-built/components/global/controls-height';

import {App} from './app';
import './app.css';

// No ThemeProvider here on purpose: YouTrack supplies the Ring UI theme (light/dark) to the iframe,
// so the page always matches the theme chosen in YouTrack, not the operating system's.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ControlsHeightContext.Provider value={ControlsHeight.M}>
      <App/>
    </ControlsHeightContext.Provider>
  </React.StrictMode>
);
