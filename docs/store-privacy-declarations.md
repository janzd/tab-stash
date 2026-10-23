# Chrome Web Store privacy declarations

Prepared October 24, 2026, for TabStash 0.1.0, based on `main` at `7249254` and the disclosure improvements accompanying this document. These are draft dashboard entries, not a submitted or approved listing. Recheck them against the final release package and the dashboard's current field definitions.

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

Use the actual dashboard wording at submission time. The following mapping is based on code behavior, not on access to the publisher's dashboard:

| Data category | Proposed treatment | Evidence |
| --- | --- | --- |
| Web history / browsing activity | Declare | Full URLs and titles of open tabs are read and saved, including periodically when recovery is enabled. The absence of the `history` API does not negate this. |
| Website content | Declare | Manual decks and optional previews store visible-page screenshots. |
| User activity | Declare conservatively, explaining the narrow use | Tab activation, navigation, closure, and window focus events control optional previews and startup settling. There is no keystroke logging, mouse tracking, or general interaction analytics. |
| Personally identifiable information, health information, financial/payment information, authentication information, personal communications, and location | Resolve incidental-content classification before final selection | There are no dedicated account, health, payment, password, messaging, or geolocation collection features. However, unredacted screenshots, titles, or full URLs may contain these kinds of information. Do not automatically mark them absent on the basis that TabStash does not extract structured fields. Confirm how the dashboard expects incidental screenshot content to be categorized. |

Suggested explanatory text for reviewer notes:

> TabStash processes data only in the current Chrome profile. It stores tab titles, complete URLs, order, pins, window grouping, save times, and locally generated record identifiers. User-triggered visual decks and opt-in visible-page previews also store screenshots. Automatic recovery and preview collection are disabled by default. Screenshots and URLs are not redacted and may include sensitive page content. Tab and window events support these features; there is no behavioral advertising or analytics. No saved data is uploaded to the publisher or any TabStash service. Users can delete local records and export manual decks to unencrypted JSON files they control.

Proposed limited-use attestations, to confirm against the dashboard's wording:

- Data is not sold or transferred for advertising, data brokerage, or other unrelated purposes.
- Data is used only to provide the session-saving features described in the listing and policy.
- Data is not used for creditworthiness or lending decisions.

These statements describe current use; they do not resolve the separate storage-security question below.

## Disclosures before user action

The accompanying UI text describes titles, complete URLs, screenshots where applicable, local storage, and the absence of uploads before users start manual capture or enable either automatic feature. Screenshot disclosure also warns that visible content may be private. The existing **Stash tabs** action and off-by-default feature switches remain the affirmative actions. No extra consent dialog or new collection is introduced.

## Open release questions

### Local encryption and exported backups

The live [User Data FAQ, question 9](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) explicitly describes encryption at rest. The consolidated [Handling Requirements](https://developer.chrome.com/docs/webstore/program-policies/policies) requires secure handling and mentions encrypted transmission. Neither source reviewed here establishes that Chrome extension isolation alone satisfies encryption at rest for this implementation.

Current facts: IndexedDB and Chrome local storage contain data without application-level encryption. TabStash does not establish whether the device uses disk encryption. JSON exports are intentionally readable. The policy discloses this; disclosure does not itself establish compliance.

**Keep this unresolved before submission.** Obtain a specific answer from Chrome Web Store support or implement an appropriate encryption design before asserting compliance. Do not describe a hard-coded key or a key stored beside the data as an established solution. Any change must account for browser restarts, unattended recovery saves, key loss, migration of existing data, and user-requested exports.

### Support inquiry draft — not sent

Subject: Local-only session manager: encryption-at-rest and screenshot data declarations

> We are preparing TabStash, a Manifest V3 session-saving extension. It stores titles, full URLs, window layout, and user-requested screenshots locally in IndexedDB; optional recovery stores tab metadata and optional visible-page previews use session storage. It has no backend, uploads, analytics, or remote code. Data is isolated to the extension's Chrome profile but not encrypted by the extension. Users can explicitly export manual decks as readable JSON containing screenshots.
>
> Does the User Data FAQ's encryption-at-rest requirement require application-level encryption for this local-only design, or is a documented browser/OS protection sufficient? If application encryption is required, what criteria apply to unattended recovery saves and user-requested exports?
>
> For the privacy dashboard, should unredacted screenshots and URLs be declared under every potentially present sensitive-data category (such as health, financial information, authentication information, personal communications, and location), in addition to website content and browsing activity, even though the extension does not extract or transmit those fields? Which category should cover tab/window events used only to control preview collection?

Send only after the publisher approves the inquiry. Record any response and resulting implementation/declaration changes here.

## Submission status

- Permission justifications and remote-code answer prepared.
- Public policy URL verified after merge.
- In-product disclosure wording reviewed and clarified.
- Dashboard category selections, local-storage security, publisher attestations, and the final package remain to be confirmed. No dashboard fields have been submitted and no support inquiry has been sent.

Reference: [Chrome Web Store privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
