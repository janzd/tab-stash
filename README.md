# TabStash

A little space for your open tabs. TabStash saves a Chrome session as a visual deck of small screenshots, titles, and links. Built as a local-first Manifest V3 extension with vanilla JavaScript, CSS, and IndexedDB. No account, server, analytics, external fonts, or build step.

## Install locally

1. Open `chrome://extensions` in Chrome 120 or later.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project's **extension** directory (`~/Code/tools/TabStash/extension`).
4. Pin **TabStash** in Chrome's extensions menu, then click its icon.
5. Click **Stash open tabs**, name the deck, choose this window or all normal windows, and grant screenshot access when Chrome asks.

After editing extension files, click **Reload** on its card in `chrome://extensions` and reload the TabStash page.

## What it does

- Saves sessions as stacked visual deck covers; opens decks into screenshot cards with page titles and domains.
- Captures the visible viewport, resizes to at most 640 pixels wide, and stores compressed JPEG previews locally.
- Saves every eligible tab's link before capture starts, then checkpoints after each screenshot.
- Searches deck names, tab titles, and URLs in All decks; sorts by date or name. Inside an open deck, search filters individual tab cards by title or URL, shows a match count, and keeps you in the deck. Clear search to see every tab again. Library and per-deck queries stay separate while the page is open; restoring or exporting a filtered deck still includes all its tabs.
- Opens a single tab or restores an entire deck into new windows, preserving window separation, tab order, and pins.
- Renames and deletes saved decks. Deletion never closes open tabs.
- Exports/imports JSON backups with screenshots. Import validates the entire file and creates copies without overwriting existing decks.
- Stops capture while retaining all saved links and completed previews.
- Recovers interrupted sessions on the next library visit.
- Offers **Light**, **Dark**, and **System** themes through the icon slider at the bottom of the left sidebar, just above “On this device. Just for you.” Use the sun, moon, or monitor for Light, Dark, or System; keyboard users can Tab to the control and use arrow keys. In narrow windows, the slider stacks vertically in the sidebar. System is the default and follows device appearance changes live. Choose **Blue**, **Sage**, **Violet**, or **Amber** on the separate Settings page, opened in the current tab with the top-right gear, or by right-clicking the extension icon and choosing **Options**. Each palette has matching light and dark accents; all dark variants use neutral charcoal surfaces. Blue is the default for new and existing installations, while existing Light/Dark/System choices are preserved. The preference is saved in this Chrome profile and synchronized across open TabStash pages. Captured screenshots keep their original colors, and backups contain only decks, not appearance preferences.

## How screenshots work

Chrome's `tabs.captureVisibleTab` API can capture only the active tab. TabStash briefly activates each eligible tab and focuses its window, waits for rendering, and captures it serially (below Chrome's two-captures-per-second limit). It restores the previous active tabs and focused window after completion or cancellation. Leave Chrome alone while capture runs to avoid missing previews.

Chrome needs the optional `<all_urls>` permission for this operation. TabStash requests it when you first click **Stash tabs**, rather than during installation. It does not inject scripts or upload any content. `tabs` reads titles, URLs, window membership, and pins; `storage` shares capture progress and saves appearance preferences; `unlimitedStorage` keeps the local screenshot library from hitting the default storage quota.

## Current limits

- Sleeping/discarded tabs, minimized windows, local files, and browser pages are saved as links with a clear placeholder, without loading or waking them. Capture failures also keep the link.
- Extension pages, developer tools, `data:` / `blob:` URLs, and incognito tabs are excluded. Screenshots of protected pages may be blocked or blank.
- A page that keeps loading beyond eight seconds is saved without a screenshot. Dynamic content may continue rendering after the initial wait.
- Restoring reopens URLs, not page history, forms, scroll position, login state, or tab groups. Chrome may reject some internal-page URLs; the restore message reports failures.
- Backups are limited to 100 MB per file; export individual decks for large libraries. Screenshot backups contain the visible page content, including anything private shown on screen.
- Local data is tied to this Chrome profile and extension ID. Uninstalling the extension removes its local data. Export a backup first if you want to keep it.
- This is an unpacked developer version, not a Chrome Web Store release.

## Development

Node.js 22+ is recommended. The extension itself has no runtime dependencies.

```sh
npm test
npm run check

# Optional browser integration tests:
npm install
npx playwright install chromium
npm run test:e2e
```

The browser test uses an isolated Chromium profile, local fixture pages, and a temporary copy of the extension with screenshot permission pregranted. It exercises real screenshot capture, persistence, restore, search, rename, backups, cancellation, and deletion without touching your Chrome profile. It also checks theme switching, synchronization across pages, browser-restart persistence, palette contrast, and screenshot preservation. It requires a desktop session (headed Chromium); Linux CI can use Xvfb. Screenshots are written under `test-results/`.

Interface colors live in `extension/themes.css` as semantic variables, including accents, surfaces, deck covers, and illustrations. Each preset defines complete coordinated light and dark variants; Settings previews use those same tokens. `extension/palettes.js` lists the available presets. Palette choice is independent of Light/Dark/System and synchronizes across open Settings and library pages. Missing or invalid palette preferences fall back to Blue. Appearance preferences stay in Chrome local storage and are not included in deck backups.

## Project map

```text
extension/
  manifest.json       Chrome permissions and entry points
  background.js       Capture coordinator and worker recovery
  capture.js          Safe serial tab capture and thumbnail compression
  db.js               IndexedDB transactions
  model.js            Search, URL policy, and backup validation
  library.html        Deck browser and dialogs
  library.js          UI, restore, import, and export
  styles.css          Responsive visual design
  settings.html       Separate Chrome Options page
  settings.js         Predefined palette cards and paired previews
  settings.css        Settings layout and preview styling
  palettes.js         Shared preset catalog
  themes.css          Coordinated light/dark semantic palette tokens
  theme.js            Early appearance setup, preference storage, and live synchronization
  icons/              Packaged toolbar/app icons
tests/                Unit and real-browser integration tests
scripts/check.mjs     Manifest, asset, and syntax checks
```

API references: [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Chrome tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs), [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
