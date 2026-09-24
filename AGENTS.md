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

## 予定・ToDoの運用ルール
- 会議・来客・旅行など、日時を把握するものは予定（event）として登録する。
- 振込・資金移動・提出・準備・確認など、完了チェックが必要な作業はToDo（todo）として登録する。分類（TOSHI / CPG / TASK / Trip / GOLF）はToDoにも付けられる。
- Googleカレンダーの「TASK」は分類名であり、HUBのToDoの完了状態とは連動しない。予定名に「✅」「完了」を書くだけで完了チェックを実装したと扱わない。
- 「お金」は入出金記録に専用の完了チェックがある。作業のToDoと両方に登録するときは、同じ作業が未完了として二重に残らないよう照合する。
- HUBのローカルToDoは端末のlocalStorageに保存される。GoogleのTASKカレンダーにある振込・確認・準備などの実行作業は、HUBでToDoとして読み取り表示し、完了チェックは端末のlocalStorageに保存する。チェック結果はGoogleカレンダーへ書き戻されず、別端末とも同期しない。元のGoogle予定を安易に削除しないこと。
