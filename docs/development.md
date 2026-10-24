# Development

[← Back to TabStash](../README.md)

Node.js 22+ is recommended. Git and Python 3.9+ are required for release packaging and its tests. The extension itself has no runtime dependencies.

```sh
npm test
npm run check

# Optional browser integration tests:
npm install
npx playwright install chromium
npm run test:e2e
```

The browser test uses an isolated Chromium profile, local fixture pages, and a temporary copy of the extension with screenshot permission pregranted. It exercises real screenshot capture, persistence, restore, search, rename, backups, cancellation, and deletion without touching your Chrome profile. It also checks theme switching, synchronization across pages, browser-restart persistence, palette contrast, and screenshot preservation. Recovery checks cover real alarms, startup grace, deduplication, retention, interrupted writes, restoring windows and pins, and persistence across a browser restart. It requires a desktop session (headed Chromium); Linux CI can use Xvfb. Screenshots are written under `test-results/`.

Interface colors live in `extension/themes.css` as semantic variables, including accents, surfaces, deck covers, and illustrations. Each preset defines complete coordinated light and dark variants; Settings previews use those same tokens. `extension/palettes.js` lists the available presets. Palette choice is independent of Light/Dark/System and synchronizes across open Settings and library pages. Missing or invalid palette preferences fall back to Blue. Appearance preferences stay in Chrome local storage and are not included in deck backups.

## Project map

```text
extension/
  manifest.json       Chrome permissions and entry points
  background.js       Capture coordinator and worker recovery
  capture.js          Safe serial tab capture and thumbnail compression
  preview-cache.js    Experimental visible-tab preview collection
  db.js               IndexedDB transactions
  model.js            Search, URL policy, and backup validation
  library.html        Deck browser and dialogs
  library.js          UI, restore, import, and export
  styles.css          Responsive visual design
  settings.html       Separate Chrome Options page
  settings.js         Predefined palette cards and paired previews
  settings.css        Settings and recovery layouts
  recovery.html       Separate automatic session history page
  recovery.js         Browse, restore, and delete recovery saves
  recovery-service.js Alarm scheduling, startup protection, and serialized operations
  recovery-model.js   Metadata filtering, deduplication, and retention policy
  recovery-db.js      Persistent recovery history and atomic pruning
  recovery-restore.js Reopen saved windows and pinned tabs
  recovery-settings.js Automatic-save preferences and status
  palettes.js         Shared preset catalog
  themes.css          Coordinated light/dark semantic palette tokens
  theme.js            Early appearance setup, preference storage, and live synchronization
  icons/              Packaged toolbar/app icons
tests/                Unit and real-browser integration tests
scripts/check.mjs     Manifest, asset, and syntax checks
```

## Implementation notes

TabStash uses Manifest V3, vanilla JavaScript, CSS, and IndexedDB. There is no build step or runtime dependency. Manual decks and recovery history use separate databases.

### Capture and permissions

Manual capture saves every eligible link before starting screenshots, then checkpoints after each image. It captures the visible viewport serially below Chrome's two-captures-per-second limit and resizes JPEG previews to at most 640 pixels wide. A page still loading after eight seconds is kept as a link without a screenshot. Capture restores the original active tabs and focused window after completion or cancellation.

The optional `<all_urls>` permission enables screenshot capture and is requested when needed. `tabs` reads session metadata; `storage` shares capture progress and preferences; `unlimitedStorage` supports the local screenshot library; `alarms` schedules recovery checks. The extension does not inject scripts or upload captured content.

### Recovery scheduling and retention

Intervals are 1, 5, 15, 30, or 60 minutes (default: 5). Retention choices are 10, 25, 50, or 100 saves (default: 50). Deduplication compares stored metadata while ignoring transient browser IDs and window enumeration order.

History uses a conservative 20 MiB metadata budget. Individual saves larger than 10 MiB are skipped without changing existing history. Insertion and pruning share an IndexedDB transaction. The latest save from the previous browser session is protected from automatic pruning during the current session, within the selected count limit; explicit deletion can remove it.

After startup, saving waits at least one minute and allows up to five minutes for tabs to settle. Empty sessions do not replace previous saves. Scheduling resumes when enabled after a restart or extension update. Chrome may delay alarms, so periodic recovery cannot guarantee recovery of changes since the latest completed save.

### Experimental preview collection

The opt-in preview collector is independent of manual decks and recovery saves. See the [experiment notes](preview-cache-experiment.md) for eligibility, cache limits, validation gaps, and follow-up work.

API references: [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Chrome tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs), [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## Chrome Web Store release preparation

The [store listing draft](store/listing.md) contains the description, screenshot upload order, and instructions for reproducing the store images with fictional sample tabs. See the [privacy declarations](store-privacy-declarations.md) for permission justifications and unresolved submission questions. These documents are preparation material, not a published listing.

Build a local upload candidate with `npm run package`. The [release guide](release.md) documents the ZIP contents, verification record, and remaining checks before submission.
