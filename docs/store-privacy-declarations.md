# Chrome Web Store privacy declarations

Updated November 24, 2026, for TabStash 0.1.0 following Patrick Kettner's November 3 clarification in the Chromium Extensions group. These entries describe the release candidate and store draft; they do not constitute Chrome Web Store approval.

## Single purpose

Save and restore browser sessions locally, using visual decks of tab screenshots and links, with optional automatic recovery history and visible-page previews.

## Privacy policy URL

[TabStash Privacy Policy](https://github.com/janzd/tab-stash/blob/main/PRIVACY.md)

The public URL returned HTTP 200 on October 24, 2026. It describes local handling, retention, deletion, unencrypted storage and backups, and the existing public support channel.

## Permission justifications

The following text can be copied into the corresponding permission fields. All requested permissions are used by existing features; no manifest changes are proposed in this review.

### `tabs`

TabStash reads titles and URLs from open tabs so users can save and search visual decks and, if enabled, keep automatic recovery history. This includes tabs across normal windows in the current Chrome profile. Metadata-only recovery must work without granting screenshot website access. TabStash does not read Chrome's browsing-history database or access incognito tabs.

### `storage`

TabStash uses local extension storage for preferences and recovery status, and session storage for capture progress, temporary previews, and recovery startup state. These allow its service worker and interface pages to coordinate. TabStash does not use Chrome Sync or send this information to a server. Saved decks and recovery records use local IndexedDB databases.

### `unlimitedStorage`

Users deliberately keep visual decks containing many compressed screenshots, including decks imported from JSON backups. This permission allows the local IndexedDB screenshot library to grow beyond default quotas and protects it from automatic storage eviction. Manual decks are kept until the user deletes them. The temporary preview cache and automatic recovery history have their own size and retention limits.

### `alarms`

When a user enables automatic recovery saves, a named Chrome alarm schedules periodic snapshots of open-tab metadata. The alarm is cleared when automatic saving is disabled. It does not take screenshots or activate tabs. The feature is off by default, and its check interval is configurable.

### Optional host permission: `<all_urls>`

TabStash requests website access only when a user starts manual screenshot capture or enables experimental visible-page preview collection. Chrome's captureVisibleTab API requires either this host permission or a user-invoked activeTab grant. Saving a full window or multiple windows requires screenshots from multiple tabs; a temporary grant for only the invoking tab does not cover that workflow. The optional collector also works as users browse eligible pages without invoking the extension separately on each tab. Screenshots are retained locally. TabStash does not inject scripts, scrape page DOM, or upload page contents.

## Minimum-permission review

| Permission | Code evidence | Why the narrower alternative does not cover the current feature |
| --- | --- | --- |
| `tabs` | `background.js`, `recovery-service.js`, `capture.js`, `preview-cache.js` | `activeTab` covers an invoked tab, not all tabs in scheduled session saves. Optional host access may be absent when metadata-only recovery is enabled. Creating/restoring tabs alone is not the justification for this permission. |
| `storage` | `theme.js`, `background.js`, `recovery-service.js`, `preview-cache.js` | The implementation uses `chrome.storage.local` and `chrome.storage.session`; this permission enables those APIs. |
| `unlimitedStorage` | `db.js`, `library.js`, `capture.js` | `navigator.storage.persist()` can protect against eviction but does not remove quotas for user-retained screenshot libraries. This permission applies to IndexedDB as well as extension storage. |
| `alarms` | `recovery-service.js` | An ordinary JavaScript timer is not a dependable scheduler across Manifest V3 service-worker suspension. |
| Optional `<all_urls>` | `library.js`, `settings.js`, `capture.js`, `preview-cache.js` | `captureVisibleTab` requires `<all_urls>` or `activeTab`; changing tab activation programmatically does not grant `activeTab` on each tab. A separate invocation per tab would change the full-session workflow. |

No `history`, `cookies`, `scripting`, `debugger`, `webRequest`, or `downloads` permission is requested. The extension does not ask for file-URL screenshot access; local-file tabs are retained as links when eligible. If preview collection is omitted from the release, remove its references from the host justification; manual multi-tab screenshots still use optional website access.

Sources: [Tabs permissions and capture API](https://developer.chrome.com/docs/extensions/reference/api/tabs), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [storage and eviction](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies), [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms).

## Remote code

Proposed answer: **No, the extension does not execute remotely hosted code.**

All JavaScript and CSS used by the extension are packaged locally. There are no remote scripts, CDN dependencies, dynamic remote imports, or executable strings in imported backups. The extension's content security policy restricts scripts to itself and sets `connect-src 'none'`. A restored website's own code runs in that website's tab, not as extension code. The GitHub privacy-policy link is ordinary navigation, not a remote-code dependency.

## User-data declarations

Do not claim “no user data handled” or “no data collected” solely because nothing is uploaded. Google's FAQ explicitly includes local handling and screenshots. The extension has no backend or telemetry, but it does read and retain browsing information.

Use the following selections for the current local-only implementation, based on the [November 3 clarification](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/g9zLwkmhzt8). Recheck if data handling changes:

| Data category | Dashboard selection | Evidence |
| --- | --- | --- |
| Web history | Check | Full URLs and titles of open tabs are read and saved, including periodically when recovery is enabled. The absence of the `history` API does not negate this. |
| Website content | Check | Manual decks and optional previews store visible-page screenshots. |
| User activity | Leave unchecked | Tab/window events trigger feature work but are not retained as an activity log. There is no click, scroll, or keystroke logging. |
| Personally identifiable information, health information, financial/payment information, authentication information, personal communications, and location | Leave unchecked | TabStash does not specifically collect these categories. Incidental sensitive content in screenshots and URLs is disclosed in the privacy policy; Patrick clarified that it does not require checking these additional categories. |

Suggested explanatory text for reviewer notes:

> TabStash processes data only in the current Chrome profile. It stores tab titles, complete URLs, order, pins, window grouping, save times, and locally generated record identifiers. User-triggered visual decks and opt-in visible-page previews also store screenshots. Automatic recovery and preview collection are disabled by default. Screenshots and URLs are not redacted and may include sensitive page content. Tab and window events trigger these features and are not retained as an activity log; there is no behavioral advertising or analytics. No saved data is uploaded to the publisher or any TabStash service. Users can delete local records and export manual decks to unencrypted JSON files they control.

Proposed limited-use attestations, to confirm against the dashboard's wording:

- Data is not sold or transferred for advertising, data brokerage, or other unrelated purposes.
- Data is used only to provide the session-saving features described in the listing and policy.
- Data is not used for creditworthiness or lending decisions.

These statements describe the current implementation. Check the dashboard's exact certification wording before saving.

## Disclosures before user action

The accompanying UI text describes titles, complete URLs, screenshots where applicable, local storage, and the absence of uploads before users start manual capture or enable either automatic feature. Screenshot disclosure also warns that visible content may be private. The existing **Stash tabs** action and off-by-default feature switches remain the affirmative actions. No extra consent dialog or new collection is introduced.

## Resolved policy questions

The inquiry was posted October 25, followed up November 2, and answered by Patrick Kettner on November 3, 2026. A thank-you was sent November 24 and was pending group moderation at submission.

[Inquiry and reply](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/g9zLwkmhzt8).

### Local encryption and exported backups

Patrick confirmed that the encryption guidance does not apply to this local-only design, including files exported to the user's own disk. No application-level encryption change is required on that basis. This resolves the earlier release question; it is not approval of the submitted extension.

Keep the existing disclosures: local databases and readable JSON backups are not encrypted by TabStash. Chrome profile isolation is not described as encryption. A privacy policy is still required, and Patrick indicated that the existing policy covers the described handling.

### Data categories and event triggers

Use Web history for saved tab metadata and Website content for screenshots. Incidental sensitive content remains disclosed in the policy. Unrecorded tab/window event triggers do not require User activity. The selection table above implements this guidance.

Reassess these conclusions if TabStash adds uploads, synchronization, activity logs, or targeted sensitive-data features.

## Submission status

- Permission justifications and remote-code answer prepared.
- Public policy URL verified after merge.
- In-product disclosure wording reviewed and clarified.
- Publisher registration and candidate ZIP upload completed; listing assets and initial privacy fields were saved in the store draft.
- Data-category and local-encryption questions resolved as recorded above. Final dashboard certifications and review submission remain to be completed.
- The policy clarification is not a store review or publication approval.

Reference: [Chrome Web Store privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
