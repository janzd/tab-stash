# Privacy policy review

Policy reviewed October 23, 2026. Publication, permissions, and in-product disclosures reviewed October 24, 2026, against `main` at `7249254` and the accompanying disclosure changes.

## Policy source and publication

The public policy is [PRIVACY.md](../PRIVACY.md). Use this stable URL in the Chrome Web Store privacy-policy field:

https://github.com/janzd/tab-stash/blob/main/PRIVACY.md

Settings links to this URL. The public URL returned HTTP 200 on October 24, 2026, after merge. GitHub hosts the policy; no separate website deployment is needed. The policy uses the existing public issue tracker as the contact channel and tells users not to post private browsing data.

## Implementation evidence

| Policy subject | Implementation checked |
| --- | --- |
| Manual deck metadata, screenshots, identifiers, and progress | `extension/background.js`, `extension/capture.js`, `extension/db.js` |
| Opt-in recovery, fingerprints, retention, and startup protection | `extension/recovery-model.js`, `extension/recovery-service.js`, `extension/recovery-db.js` |
| Opt-in previews, local diagnostics, cache size, age filtering, and closed-tab deletion | `extension/preview-cache.js`, `extension/settings.js` |
| Preferences and local appearance cache | `extension/theme.js`, `extension/recovery-settings.js` |
| Local import/export, JSON screenshots, deck-only backup scope | `extension/library.js`, `extension/model.js` |
| Permissions and incognito exclusion | `extension/manifest.json` |

The audit found no upload, analytics, remote-script, or Chrome Sync code in `extension/`. Opening restored URLs and external links is ordinary browser navigation; it is not a transfer of the saved library to a TabStash backend. Screenshots and complete URLs can contain sensitive information, and no redaction is implemented.

## Release follow-ups

This policy documents current behavior; adding it does not establish full Chrome Web Store compliance.

- Resolve the storage-security requirements before submission. Data is stored in IndexedDB and Chrome storage without application-level encryption, and exported JSON is unencrypted. Google's User Data FAQ currently describes encryption at rest, while the consolidated Handling Requirements section emphasizes secure handling and encrypted transmission. Review the applicable requirements and seek clarification from Chrome Web Store support if necessary; do not claim encryption or compliance that has not been verified. An encryption design, if needed, must include a meaningful key-management and recovery model.
- Manual capture and both automatic features now describe their data handling before the user acts, with accessible descriptions on the action controls. Screenshot disclosures include private-content warnings. Recheck these against the final release; a policy link alone is not a substitute for disclosure and consent.
- Use the [draft store declarations](store-privacy-declarations.md) for permission justifications, remote code, and the data-use review. Resolve the noted classification and security questions before completing the publisher dashboard. Do not describe local handling as “no user data handled.”
- Keep the store listing and policy aligned with the features actually included in the release. The public policy URL has been verified; no dashboard declarations have been submitted.

## Sources

- [Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local processing, policy content, consent, and security requirements.
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies): privacy policy, Limited Use, secure handling, and minimum permissions.
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy): purpose, permissions, data-use declarations, and policy URL.
