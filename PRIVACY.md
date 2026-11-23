# Privacy Policy — Issue Export for YouTrack

_Last updated: November 23, 2026_

This policy describes how the **Issue Export** app for YouTrack ("the app"), published by
[Codeo](https://www.codeo.com.tr/) ("we"), handles data.

## Summary

The app runs entirely inside your YouTrack instance and your browser.
**We do not collect, store, transmit, sell or share any personal data or issue data.**

## What data the app accesses

- **YouTrack data:** to show filters, a preview and the exported file, the app reads projects, project fields,
  users who can be set in those fields, tags and issues from your YouTrack instance through the YouTrack app
  host API. These requests run with the permissions of the signed-in YouTrack user, so the app can only read
  what that user is already allowed to see. The app requests only the `READ_ISSUE` permission and never
  changes any data in YouTrack.
- **Exported files:** Excel (.xlsx) and CSV files are generated in your browser and saved to your device
  through the browser's normal download. They are never uploaded anywhere.

## What data the app stores

- The app remembers your last chosen file format and CSV separator in your browser's local storage, so the
  next export starts with the same choice. This stays on your device and contains no personal or issue data.
  You can clear it at any time by clearing your browser's site data for your YouTrack instance.
- The app does not use cookies and does not store anything on servers.

## What the app does not do

- It does not send data to Codeo or to any third party.
- It contains no analytics, tracking, advertising or telemetry.
- It does not connect to any server other than your own YouTrack instance.

## Third-party components

The app bundles open-source libraries (Ring UI and JetBrains Icons, React, ExcelJS) that run locally in your
browser and make no network requests of their own. See [NOTICE](NOTICE) for details.

## Your YouTrack instance

Data in YouTrack itself is processed by JetBrains (for YouTrack Cloud) or by your organization (for YouTrack
Server) under their own privacy policies. This app does not change how that data is handled.

## Changes to this policy

If the app's handling of data changes, this policy will be updated and the date above will change.
The current version is always available in the app's source repository.

## Contact

For questions about this policy, contact Codeo through [www.codeo.com.tr](https://www.codeo.com.tr/).
