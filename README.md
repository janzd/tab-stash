# TabStash

**Save the tabs. Keep the big picture.**

TabStash is a Chrome extension that turns your open tabs into visual decks of screenshots, titles, and links. Keep a project, research session, or collection of ideas ready to revisit when you want to clear your workspace.

Everything stays in your Chrome profile. No account, cloud service, or analytics.

## Features

- **Visual tab decks** — save one window or all windows, then browse your tabs as screenshot cards.
- **Search where you are** — find a deck across your library, or find a specific tab inside an open deck by title or URL.
- **Restore your workspace** — reopen an individual tab or an entire session, preserving window separation, tab order, and pinned tabs.
- **Automatic recovery saves** — optionally keep a history of open tabs without taking screenshots or interrupting your browsing.
- **Portable deck backups** — export and import JSON files with screenshots included.
- **Make it yours** — choose Light, Dark, or System appearance and a matching Blue, Sage, Violet, or Amber palette.

## Install

Requires **Chrome 120 or later**. Install from source using Chrome's **Load unpacked** option; no build step is needed.

1. [Download the source ZIP](https://github.com/janzd/tab-stash/archive/refs/heads/main.zip) and extract it, or clone this repository:

   ```sh
   git clone https://github.com/janzd/tab-stash.git
   ```

2. Keep the extracted or cloned folder somewhere permanent.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Click **Load unpacked** and select the `extension` folder inside the project.
5. Pin TabStash in Chrome's extensions menu and click its icon to open your library.

To update, replace or pull the source in the same location, click **Reload** on TabStash's card in `chrome://extensions`, and refresh any open TabStash pages.

## Save and revisit your tabs

Click **Stash open tabs**, give the deck a name, and choose **This window** or **All normal windows**. Click **Stash tabs** and grant website access when Chrome asks.

Chrome briefly switches to each eligible tab to take its screenshot, then returns you to where you were. Let capture finish before switching tabs. Sleeping tabs and pages that cannot be captured are kept as links. You can stop capture and keep the links and screenshots already saved.

Open a deck to browse its cards, search its tabs, or restore it into new windows. Saving a deck leaves your current tabs open; close them when you're ready. Restoring a deck also leaves existing tabs in place.

## Keep a recovery history

Enable **Settings → Automatic recovery saves → Save sessions automatically** to keep periodic snapshots of your open tabs. It is off by default.

| | Visual decks | Recovery saves |
| --- | --- | --- |
| When saved | When you choose to stash tabs | Automatically, when enabled |
| Contents | Titles, links, and available screenshots | Titles and links, without screenshots |
| Best for | Saving work to revisit later | Recovering tabs after an unexpected closure or crash |
| Retention | Until you delete a deck | Configurable history limits |

Recovery checks every **5 minutes** and keeps up to **50 saves** by default. Both settings are adjustable. Only changed sessions create a new save, and storage limits may reduce the number kept.

Open **Recovery** in the sidebar to inspect a saved session, reopen a tab, or restore the whole session into new windows. Saves include all eligible windows in the current Chrome profile; other profiles remain separate. Closing tabs or restarting Chrome does not erase earlier saves. Turning the feature off keeps existing history.

Recovery does not switch tabs, take screenshots, or wake sleeping tabs. Checks may be delayed during startup or sleep, so changes made after the latest completed save may be lost in a crash.

## Backups and privacy

Use **Export library** or **Export deck** to download a JSON backup. Screenshots are embedded in the file alongside titles and links. **Import backup** adds copies without overwriting existing decks.

Backups contain **manual decks only**; recovery history, temporary previews, and settings are not included. Files are limited to 100 MB each—export individual decks for larger libraries.

TabStash stores its data locally and does not upload your tabs or screenshots. Website access is requested for screenshot capture. Incognito tabs are excluded. Screenshots and exported backups may contain private information visible on a page, so keep backup files somewhere you trust.

Data belongs to the Chrome profile and extension installation. Uninstalling TabStash removes its local data; export any decks you want to keep first.

## Appearance

Use the sun, moon, or monitor in the sidebar to choose **Light**, **Dark**, or **System**. Choose a color palette in **Settings**, opened with the top-right gear or by right-clicking the extension icon and selecting **Options**. Settings opens in the same tab from the library.

## Experimental previews

**Settings → Previews while you browse** offers an optional preview collector for pages you are already viewing. It is experimental, off by default, and may change or be removed based on feedback.

These previews are temporary: closing a tab removes its preview, and restarting Chrome or reloading the extension clears the cache. They do not become saved decks or screenshots in recovery history. See the [experiment notes](docs/preview-cache-experiment.md) for details and limitations.

## Things to know

- Screenshots capture the visible viewport, not the full page. Some protected pages may produce a blank image or no preview.
- Sleeping tabs, local files, browser pages, and tabs in minimized windows can be saved as links without screenshots. Extension pages, developer tools, and unsupported addresses are excluded.
- Restoring reopens URLs, not forms, scroll positions, navigation history, login state, or tab groups. Some internal Chrome pages cannot be reopened.

## Feedback and development

Found a bug or have an idea? [Open an issue](https://github.com/janzd/tab-stash/issues).

For local development, tests, and the project structure, see the [development guide](docs/development.md).
