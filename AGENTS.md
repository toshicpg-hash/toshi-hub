# TOSHI HUB maintenance instructions

## Canonical locations
- Repository: https://github.com/toshicpg-hash/toshi-hub
- Production: https://toshicpg-hash.github.io/toshi-hub/
- Default branch: `main`
- Deployment: GitHub Pages workflow triggered by updates to `main`

## Required workflow
1. Use the authenticated GitHub connector first. Confirm access with `get_profile` and `get_repo`.
2. Read the current repository files before editing; never rely on an old local copy.
3. For existing files, fetch the current blob SHA and update the same path.
4. After changing the app, bump the visible version in `index.html`, the cache name in `sw.js`, and the description version in `manifest.json`.
5. Verify the GitHub Pages workflow completes successfully.
6. Verify the production page returns HTTP 200 and contains the new version or feature text.
7. Never ask the user to send a password, access token, or verification code. Do not ask the user to download and re-upload files while the GitHub connector is available.

## App notes
- The application is a static PWA.
- User data is stored in browser localStorage under `toshi_v5`.
- Preserve existing localStorage data compatibility.
- Service Worker cache changes require a new cache version.
