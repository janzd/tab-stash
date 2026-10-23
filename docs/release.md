# Release candidate 0.1.0

This is a locally tested candidate, not a published Chrome Web Store release. Experimental previews remain included, clearly labeled and off by default. Automatic recovery is also off by default. The unresolved privacy questions below still need to be addressed before submission.

## Build the upload ZIP

Requires Git, Node.js 22+, and Python 3.9+ (standard library only). From the repository root:

```sh
npm test
npm run check
npm run test:e2e
npm run package
```

Install development dependencies and Playwright Chromium before the browser suite, as described in the [development guide](development.md). Packaging itself does not need npm dependencies or Playwright.

`npm run package` checks the extension, then writes:

- `dist/tabstash-0.1.0.zip` — only committed files from `extension/`, with `manifest.json` at the archive root.
- `dist/tabstash-0.1.0.zip.sha256` — SHA-256 checksum.
- `dist/tabstash-0.1.0.json` — source commit, archive size/hash, and per-file hashes.

The output directory is ignored by Git. The ZIP excludes repository documentation, tests, scripts, store images, and ignored metadata such as `.DS_Store`. Modified or untracked extension files block packaging; commit intended changes first. Tracked symlinks and hidden files are rejected. File order, timestamps, permissions, and compression settings are fixed, so identical extension content produces identical ZIP bytes with the same Python/zlib runtime.

The packager verifies the ZIP's integrity and every archived byte against the source Git blobs. The manifest version must match `package.json`. Keep `package-lock.json` in sync when changing the package version. Version 0.1.0 is the initial candidate; increment the version for any subsequent upload that requires a new version.

## Verification record — October 24, 2026

Runtime extension content was checked from `main` at `61d92c2`, after the icon PR merged. This packaging PR does not change extension behavior or assets.

Environment: macOS 15.5, Node.js 25.6.0, Python 3.12.10, Chrome for Testing / Chromium 148.0.7778.96.

| Check | Result |
| --- | --- |
| Unit and package tests | 54 passed, zero failures or skipped tests |
| Manifest, assets, and JavaScript syntax | Passed |
| Full browser integration suite | Passed |
| ZIP inspection | 26 files; 46,906 bytes; root manifest; per-file byte verification passed |
| Fresh install from extracted ZIP | Library, Settings, recovery, and all icon sizes loaded without UI errors |
| Fresh-install privacy defaults | Optional website permission absent; recovery and previews off; no recovery alarm scheduled |

Browser coverage includes manual capture and image identity, persistence, scoped search, import/export with screenshots, deletion, cancellation, interrupted captures, multiple windows and pins, restricted-page link fallback, themes and palettes, preview collection in full screen, recovery alarms and retention, and real browser restarts.

The integration suite uses a disposable extension copy with screenshot permission pregranted. The fresh-install smoke check used the ZIP without modification and verified that the optional permission was absent. It did not exercise Chrome's native grant/deny prompt.

Candidate ZIP SHA-256:

```text
483bc4a72e9880a0c893e4797b011941ffd8731d5880eb59a999d921ee9103f3
```

## Remaining release checks

- Resolve the [local-storage encryption and data-category questions](store-privacy-declarations.md). The extension does not provide application-level encryption, and the existing support inquiry is still only a draft.
- Check the native website-access prompt, denial, later grant, and permission revocation in the Chrome version used for release acceptance. Test with non-sensitive sample pages in a separate profile.
- Complete a live sleeping-tab check on a suitable browser build. The prior forced-discard test crashed Chromium even with previews disabled; unit coverage exists, but that live check remains unverified. See the [experiment notes](preview-cache-experiment.md).
- Verify on the supported Chrome versions and operating systems intended for launch. The automated run above does not establish coverage of Chrome 120 or every platform.
- Complete publisher registration/account setup, final dashboard declarations, and review submission. Use the [listing materials](store/listing.md), [icon](brand/README.md), and [privacy policy](../PRIVACY.md).

No ZIP has been uploaded, no dashboard attestation has been submitted, and no GitHub release or tag has been created by this preparation step.

## Check the packaged candidate manually

Extract the ZIP into a permanent directory and load that directory with Chrome's **Load unpacked** in a separate test profile. Open a few harmless pages in two windows, pin one tab, and check:

1. The library starts empty; recovery and previews are disabled in Settings.
2. Starting a stash requests website access. Try denying first, then granting on a new attempt; verify a useful error or saved links and successful later capture.
3. Saving all windows preserves titles and links, creates available screenshots, and leaves the original tabs open. Restore into new windows and verify grouping, order, and pins.
4. Export and import a deck; confirm its screenshots survive the round trip.
5. Enable recovery, change a tab, wait for a scheduled check, and confirm a new metadata-only save. Restart Chrome and restore from the history.
6. If testing previews, keep them explicitly enabled only for that test. Verify full-screen use and input/focus behavior. Disable them afterward and verify that collection stops.
7. Revoke website access and check that screenshots stop while metadata-only recovery continues.

The store expects a ZIP with the manifest at its root. See [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare). Uploading, review submission, and publishing are separate steps described in [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish).
