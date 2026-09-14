# Visible-tab preview experiment (#6)

The prototype collects a small image of the page the user is already viewing. It does not create automatic decks. This separates the question of unobtrusive screenshot collection from snapshot scheduling and retention.

## Approach

- Explicit opt-in in Settings, using the extension's existing optional website access.
- A two-second debounce after tab activation, relevant tab updates, or window changes; no continuous timer or DOM observer.
- Only a loaded HTTP(S) tab in a focused normal window is eligible. Skip incognito, discarded/frozen, audible, full-screen-window, split-view, pending navigation, and restricted/local pages.
- Read the active tab before and after `captureVisibleTab`. Browsing events invalidate an attempt with a generation counter, including switching away and back. Recheck after compression before saving.
- The collector never calls activation, focus, navigation, scrolling, or script-injection APIs. Manual capture suspends the collector and waits for its in-flight work before visiting tabs.
- One attempt per five seconds globally, and at most one successful preview per minute for a given tab and URL.
- A serialized cache in `chrome.storage.session`, capped at 40 entries and 4 MiB of conservatively estimated JSON memory. Closing a tab removes its entry. Entries over one hour old are excluded and pruned on future writes. Clearing waits for in-flight work so an earlier capture cannot refill it.
- The cache lasts for the browser session; the opt-in preference survives restarts. Existing decks and backup formats are untouched.

Settings shows the latest 12 previews with their capture time and elapsed acquisition/resizing time. These are temporary cached images, not snapshots of the entire session at that time.

## Why this approach

Chrome's [regular screenshot API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab) captures the currently active tab and limits calls to two per second. Taking screenshots opportunistically avoids switching to background tabs. [Idle detection](https://developer.chrome.com/docs/extensions/reference/api/idle) reports lack of input, which cannot establish whether interrupting a user is acceptable. [Tab capture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) is a media-stream API requiring user invocation. [Debugger capture](https://developer.chrome.com/docs/extensions/reference/api/debugger) would add debugging access and browser UI effects.

The temporary cache deliberately uses [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session) to limit the scope of this experiment and avoid adding screenshot persistence or modifying the deck database before feasibility is established.

## Evaluation and limits

Unit tests cover opt-out and permission denial, eligibility, invalidation during capture/conversion, cache bounds, failure recovery, and clear/manual-capture races. The isolated browser test checks actual screenshot identity, focus/input/scroll preservation, rapid tab switching, pause/clear, and unchanged deck data. Existing manual capture and palette tests also run. Forcing `chrome.tabs.discard()` crashed the test Chromium build with collection disabled as well as enabled; sleeping/frozen-tab exclusion is covered by unit tests, but its live browser check remains unverified in this environment.

A successful test does not establish zero performance impact on every website. Elapsed capture time is not CPU time. The prototype does not detect typing, muted video, screen sharing, or same-document visual changes. It may skip captures conservatively when unrelated background-tab events occur. Already visited pages can have stale images; unvisited tabs have none. No timer refreshes a page that remains open without relevant events.

Try it with normal browsing, typing, meetings, and larger tab collections. Assess perceived pauses, useful preview coverage, and screenshot age before implementing automatic snapshots. If it proves useful, follow-up work should define a persistent cache with navigation identity, an independent session-save schedule, explicit preview-age labels in decks, deduplication, storage/retention limits, site exclusions, and backup compatibility. Issue #6 remains open during this evaluation.
