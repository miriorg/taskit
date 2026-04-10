# taskit

Neon Postgres と Vercel Blob を使う、Next.js ベースのタスク管理アプリです。Google ログイン後に `users` を解決し、`Inbox / Project / View / 完了` の各画面で CRUD を行います。

## Stack

- Next.js App Router
- TypeScript
- Auth.js / Google OAuth
- Neon Postgres
- Vercel Blob
- Vitest
- Vercel

## Required env vars

ローカルでは `.env.local`、Vercel では Project Settings の Environment Variables に設定します。

```env
NEXTAUTH_SECRET=generated-random-secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
DATABASE_URL=your-neon-pooled-url
DATABASE_URL_UNPOOLED=your-neon-direct-url
```

`NEXTAUTH_SECRET` の生成例:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Google OAuth setup

Google Cloud Console で以下を設定します。

- Authorized redirect URI
  - ローカル: `http://localhost:3000/api/auth/callback/google`
  - 本番: `https://mtaskit.vercel.app/api/auth/callback/google`
- Authorized JavaScript origins
  - ローカル: `http://localhost:3000`
  - 本番: `https://mtaskit.vercel.app`
- OAuth consent screen は `External`
- ログイン確認に使う Google アカウントを Test users に追加

## Install and run

```powershell
corepack pnpm install
corepack pnpm dev
```

ブラウザで `http://localhost:3000` を開き、Google ログイン後に `/inbox` へ遷移できることを確認します。

開発中に `Cannot find module './vendor-chunks/...'` のような `.next` 配下の欠損エラーが出た場合は、開発ビルド成果物を作り直して再起動します。

```powershell
corepack pnpm dev:clean
```

## Verification commands

```powershell
corepack pnpm typecheck
corepack pnpm test
.\node_modules\.bin\next.cmd build
```

## Production deploy

Vercel プロジェクトをリンク済みであれば、以下で本番デプロイできます。

```powershell
C:\Users\miri\AppData\Roaming\npm\vercel.cmd deploy --prod --yes
```

## Main routes

- `/inbox`
- `/project/[projectId]`
- `/view/[viewId]`
- `/settings`
- `/theme-preview`

## Keyboard shortcuts

- `/`: 検索欄へフォーカス
- `q`: 新規タスク入力へフォーカス
- `e`: 選択中タスクを編集
- `x`: 選択中タスクを完了または再オープン
- `g i`: Inbox へ移動
- `g d`: 完了プロジェクトへ移動

## Test data generator

`/settings` で既存プロジェクトにランダムタスクを追加できます。

- 生成件数を指定可能
- タイトルは同一プロジェクト内で重複しない
- 説明文はランダム生成
- タグは固定付与またはランダム選択が可能

## View page notes

- `View` 画面では、通常は右ペインに保存ビューの条件編集を表示します
- タスクを選択して `Edit` を押すと、右ペインはタスク編集フォームへ切り替わります
- `Back to view settings` でビュー編集に戻れます
- `Complete` や `Delete` の後にタスクがビュー条件から外れた場合は、一覧から消えることがあります

## Hierarchical project checks

- プロジェクト編集でサブプロジェクトを追加できます
- 親プロジェクト変更ドロップダウンでは、自分自身、子孫、`Inbox`、`完了` は候補に出ません
- 親プロジェクト画面では `子プロジェクトを含める` を切り替えられます
- `ON` では子孫タスクを集約表示し、`OFF` ではそのプロジェクト自身のタスクだけを表示します

## Current MVP scope

実装済みの中心機能:

- Google ログイン
- Neon Postgres への bootstrap / CRUD
- Projects / Tags / Tasks / Views の基本操作
- 階層プロジェクト作成と親変更
- 保存ビューの作成・編集
- 検索
- 競合時の version チェック
- 完了タスクの `完了` プロジェクト管理

MVP 後に回している項目:

- AI タスク登録
- リマインダー実処理
- タスク行のアイコン UI への刷新
- 大量タグ前提のタグ選択 UI 再設計

## Basic smoke test

- Google ログイン後に `/inbox` へ遷移する
- タスク作成、編集、完了、削除ができる
- プロジェクト作成とタグ作成ができる
- 親子プロジェクト作成と `子プロジェクトを含める` 切り替えができる
- 保存ビューを作成して `/view/[viewId]` で表示できる
- `View` 画面でタスクの `Edit / Complete / Delete` が動く
- `完了` プロジェクトで完了済みタスクを確認できる
