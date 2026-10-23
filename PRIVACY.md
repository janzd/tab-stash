# TabStash Privacy Policy

Last updated: October 23, 2026

This policy covers the TabStash Chrome extension maintained at [janzd/tab-stash](https://github.com/janzd/tab-stash). TabStash helps you save, find, and restore browser tabs. You do not need a TabStash account.

**Your saved tabs and screenshots stay in your Chrome profile. TabStash does not send them to its maintainers or to a server, and contains no advertising, analytics, or telemetry services.**

## Information TabStash handles

TabStash uses information from the current Chrome profile to provide the features you choose:

- **Visual decks:** when you save a deck, TabStash reads tab titles, full URLs, tab order, pinned state, and window membership. It stores these with your deck name, a save time, local identifiers, capture status, and available screenshots of the visible page area. Manual capture briefly activates eligible tabs and windows to take screenshots.
- **Automatic recovery:** if you enable automatic recovery saves, TabStash periodically reads eligible open tabs across normal windows and stores their titles, full URLs, order, pins, and window grouping with a save time and a fingerprint used to avoid duplicate saves. Recovery saves do not contain screenshots. This feature is off by default.
- **Experimental previews:** if you enable preview collection and grant website access, TabStash may capture the web page already visible in the focused window. The temporary cache contains its screenshot, title, full URL, tab identifier, capture time, and capture duration. Tab and window events help decide whether capture is appropriate. This feature is off by default.
- **Preferences and operation status:** TabStash stores your appearance choices, optional-feature settings, recovery interval and retention choices, and local progress, skip, and error messages. Capture progress may include the current tab's title or URL. Status information is not sent to the maintainers.
- **Imported backups:** when you choose a backup file, TabStash reads and validates it locally and adds its decks to your library.

TabStash does not read Chrome's browsing-history database, cookies, or saved-password database. It does handle browsing information from open tabs, as described above. Incognito tabs are excluded, and TabStash does not access tabs in other Chrome profiles.

Screenshots can contain personal or sensitive information visible on a page, including messages, account information, or form contents. Full URLs and titles can also contain private information. TabStash does not automatically redact that information.

## How information is used and shared

Information handled by the extension is used to save, display, search, export, and restore your sessions, apply your settings, and report operation status. It is not sold, used for advertising, or sent to the maintainers or third parties by the extension.

TabStash's use of information received through Chrome APIs follows the Chrome Web Store's Limited Use requirements. Browsing information and page content are used only for the session-saving features described here.

Opening a saved link or restoring tabs loads the destination websites normally. Those websites may make network requests and handle information under their own policies. Manually activating a tab for a screenshot may also allow that page's normal activity to continue. TabStash does not upload its saved library as part of these actions.

If you follow a GitHub link for the source, this policy, or support, GitHub handles that visit under its own privacy policy. Information you voluntarily post in a GitHub issue is separate from the extension's local data and may be visible to the maintainers and the public.

## Storage and security

Decks and recovery saves are stored in local IndexedDB databases. Preferences and persistent status information use Chrome's local extension storage; appearance settings also have a local browser cache. Temporary previews, capture progress, and recovery startup state use Chrome's session storage. TabStash does not use Chrome Sync to synchronize this data.

TabStash relies on Chrome's extension isolation and your device's security. It does not add application-level encryption or a password lock to saved data. Exported JSON backups are also not encrypted by TabStash. Anyone with access to your unlocked browser profile or backup files may be able to read their contents. Your device's backup or synchronization software may copy profile data or exported files independently of TabStash.

## Retention and deletion

- **Manual decks** remain until you delete them or remove the extension's local data. Closing the original tabs does not delete saved decks. Delete a deck from its open-deck view; imported copies must be deleted separately.
- **Recovery history** survives tab closures and browser restarts. The default is up to 50 changed-session saves, with configurable count limits and an additional storage limit. Retention is applied when recovery saves are processed. The latest save from the previous browser session is protected from automatic pruning during the current session, within the count limit. You can delete individual saves or use **Clear history** in Recovery. Turning automatic saving off stops future saves but keeps existing history.
- **Experimental previews** are capped at 40 entries and approximately 4 MiB of estimated storage. Previews older than one hour are excluded from display and removed on later cache writes; expiry is not an immediate deletion timer. Closing a tab removes its cached preview. **Clear previews** removes the cache, and restarting Chrome or reloading the extension clears session storage. Turning collection off stops new captures but does not immediately delete cached previews.
- **Preferences and status information** are retained locally until replaced or the extension's local data is removed. Temporary session information clears when Chrome restarts or the extension reloads.

If an automatic feature remains enabled, it can create new saves or previews after you clear its history. Turn that feature off as well if you want collection to stop.

Uninstalling TabStash removes its local extension data. It does not delete exported files or copies made by your device's backup software. TabStash has no server-side copy of your saved sessions to retrieve or delete.

## Exporting your data

**Export library** and **Export deck** create JSON files containing manual decks, including their titles, URLs, names, save times, layout information, and embedded screenshots. Recovery history, temporary previews, and preferences are not included.

You control where exported files are stored and whether they are shared. Deleting a deck or uninstalling TabStash does not remove those files. Importing a backup does not upload it to the maintainers.

## Permissions and your choices

TabStash uses tab access to read session metadata and restore tabs, storage access to keep data locally, additional storage capacity for screenshot libraries, and alarms to schedule recovery checks. Optional website access is requested for screenshot capture.

You can disable automatic recovery and experimental previews in Settings, and manage website access in Chrome's extension settings. Withdrawing screenshot access prevents future screenshot capture but does not delete saved data or turn off metadata-only recovery saves.

## Policy updates and contact

Updates to this policy will be published in this repository with a revised date. Changes to how TabStash handles data will be described in the extension and will request consent where required before the new behavior begins.

For questions about this policy, contact the maintainer through the [TabStash issue tracker](https://github.com/janzd/tab-stash/issues). Issues are public: do not attach private screenshots, browsing histories, backups, or credentials. TabStash cannot access your local saved data through a support request.
