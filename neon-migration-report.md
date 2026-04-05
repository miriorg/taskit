# Google Drive から Vercel Marketplace の Neon Postgres へ移行するためのレポート

## 1. 結論

このリポジトリは、Google Drive `appDataFolder` に JSON ファイルを保存する構成から、Neon Postgres に十分移行可能です。

ただし、今回の移行は単なる保存先の差し替えではありません。現在は「Google ログインした各ユーザーの Drive に、そのユーザー専用データを保存する」モデルですが、Neon では「共有データベース上でユーザー単位にテナント分離する」モデルへ変わります。したがって、移行の本質は次の 3 点です。

1. Drive file repository を Postgres repository へ置き換える
2. `owner_user_id` を持つ multi-tenant データモデルへ移行する
3. Google OAuth の Drive 権限依存を外す

この順で進めれば、段階的に移行できます。なお今回の前提では、既存 Google Drive データの移行は不要です。したがって import script や dual-write を前提にした段階移行は必須ではなく、Neon 側へ切り替えた時点から新しい保存方式だけを正とする計画で進められます。

## 1.1 現時点の決定事項

ヒアリングシートの記入内容から、現時点で次は決定済みとみなせます。

- 移行目的はストレージ読み書き速度の改善
- 既存 Google Drive データの移行は不要
- Google ログインは継続する
- `owner_user_id` は独立した `users.id` を参照する
- `users` テーブルを導入する
- 全テーブルで `owner_user_id` を持ち、PostgreSQL RLS を併用する
- `views.filters` / `views.sort` / `views.display_options` は正規化テーブル寄りで設計する
- task と tag は `task_tags` 中間テーブルで関連付ける
- reminders は独立テーブルで保存する
- 保存競合は `version` による optimistic locking で扱う
- `Inbox` / `Done` はユーザーごとに初回ログイン時に自動作成する
- 競合時の UI は現状どおりエラー表示を維持する
- 既存 service 層は維持を基本としつつ、一部再設計する
- Vercel Marketplace の Neon は Native integration を使う
- Preview ごとに Neon branch は分けず、branch-per-preview は採用しない
- `/settings` のテストデータ生成機能も Neon 対応対象に含める
- `TestDataService` は既存 service を維持し、Neon repository 対応を行う
- ロールアウト方式は一括切り替え
- `drive.appdata` scope は Drive 実装削除時に外す
- 追加監視対象は `slow query` と `auth failure` を優先する
- task コメントは時刻順表示とし、編集のみ許可、削除は許可しない
- 添付ファイルの最大サイズは 100MB とし、許可種別は `pdf`, `jpg`, `tif`, `png`, `txt`, `md`, `doc`, `xls`, `ppt`, `ps1`, `psm`, `py` とする
- task / comment ごとの添付数上限はストレージ容量上限までとする
- DB 接続文字列は `DATABASE_URL` と `DATABASE_URL_UNPOOLED` の両方を使う
- migration 方式は SQL ファイルを採用する
- DB access は `postgres` を採用し、手書き SQL を基本とする
- `@neondatabase/serverless` は現時点では採用せず、Edge runtime などが必要になった場合の補助候補とする
- migration 実行は `その他: リリース前の手動実行` を採用する

未決の項目も残っています。

- 添付ファイル本体の保存先を `Vercel Blob` と `Cloudflare R2` のどちらにするか
- ロールバック条件と手順の具体化
- 性能目標の数値化

## 2. 現状整理

現状の保存方式は README と実装の両方で明確です。

- `README.md` では、`project.json`、`tag.json`、`view.json`、`task-<project-id>.json` を Google Drive に保存すると説明している
- `src/lib/repositories/project-repository.ts` は `project.json` を読む
- `src/lib/repositories/tag-repository.ts` は `tag.json` を読む
- `src/lib/repositories/view-repository.ts` は `view.json` を読む
- `src/lib/repositories/task-repository.ts` は `task-<project-id>.json` を読む
- `src/lib/repositories/drive-file-repository.ts` が Drive API の検索、取得、更新、削除を担っている
- `src/auth.ts` は Google OAuth scope として `https://www.googleapis.com/auth/drive.appdata` を要求している
- `src/lib/auth/session.ts` ではアプリ内ユーザー ID として `session.user.email` を使っている
- `/settings` にはテストデータ生成機能があり、`TestDataService` が project / tag / task repository を使って task を一括生成している

現行のデータモデルは次です。

- `Project`
  - `id`, `name`, `description`, `color`, `parent_id`, `system`, `created_at`, `updated_at`
- `Tag`
  - `id`, `name`, `description`, `created_at`, `updated_at`
- `Task`
  - `id`, `project_id`, `title`, `description`, `due_date`, `priority`, `status`, `tag_ids`, `attachments`, `comments`, `reminders`, `created_at`, `updated_at`, `completed_at`
- `View`
  - `id`, `name`, `filters`, `sort`, `display_options`, `created_at`, `updated_at`

## 3. Neon に移行したときの利点

- Drive のファイル単位競合判定より、DB トランザクションで整合性を取りやすい
- `task-<project-id>.json` への分散保存をやめて、SQL で横断検索、集計、JOIN ができる
- Drive API の往復が減るため、保存時の体感速度を改善しやすい
- 将来的な共有、監査、履歴、バッチ処理、分析に拡張しやすい
- Neon の branch 機能を使えば、Vercel Preview ごとに DB branch を分けられる

## 4. 主な考慮点

### 4.1 ユーザー分離モデルが変わる

Drive では「ユーザーごとの Google Drive」が自然な分離境界でした。Neon では 1 つの DB に複数ユーザーのデータが入るため、全テーブルで `owner_user_id` を前提にする必要があります。

最低限、以下のどちらかが必要です。

- アプリ側で全 query に `where owner_user_id = session.user.id` を徹底する
- さらに PostgreSQL Row Level Security を入れる

初期段階では前者でも動きますが、本番運用では後者まで入れる方が安全です。

### 4.2 現在の `session.user.email` を主キーに使うか

現状の `AppSession.user.id` は email です。短期的にはそのまま `owner_user_id` として使えますが、将来的には provider subject や独立した `users.id` に寄せた方が安定します。

推奨は次です。

- 初期移行では `users` テーブルを作る
- `users.id` は UUID
- `users.email` は unique
- アプリ起動時または sign-in 時に email から upsert
- 業務テーブルは `owner_user_id UUID` を参照

### 4.3 競合判定の考え方を変える

今は Drive file の `revision` 比較です。Neon では次のいずれかに寄せます。

- 単純な last-write-wins
- `updated_at` 比較
- `version` カラムによる optimistic locking

このアプリは現在「他画面更新で保存失敗」を扱っているので、`version integer not null default 1` を入れて optimistic locking を継続するのが一番自然です。

### 4.4 Preview 環境と DB branch

Neon は branch を作れますが、今回の方針では Preview ごとに branch は分けず、branch-per-preview も採用しません。

そのため preview 用 DB branch の自動作成や cleanup は不要です。一方で、schema 変更を含む検証は共有の preview 用接続先で行う前提になるため、migration の適用順序と検証環境の運用を明示的に管理する必要があります。

### 4.5 認証は Google のままでよいが Drive scope は不要になる

Google ログイン自体は継続可能です。ただし Drive 保存をやめた時点で `drive.appdata` scope は不要です。

変更点は次です。

- `src/auth.ts` の scope から `https://www.googleapis.com/auth/drive.appdata` を外す
- `src/lib/drive/*` と `src/lib/repositories/drive-file-repository.ts` を最終的に削除できる
- `api-error.ts` の Drive エラー文言は DB 系に置き換える

## 5. 想定ターゲット設計

ヒアリング結果を踏まえると、`views` 周辺は全面 `jsonb` より、正規化寄りで設計する方が合っています。したがって推奨スキーマは次のように読み替えます。

```sql
create table users (
  id uuid primary key,
  email text not null unique,
  name text,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null,
  parent_id uuid references projects(id) on delete set null,
  system boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table tags (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (owner_user_id, lower(name))
);

create table views (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table view_filters (
  view_id uuid primary key references views(id) on delete cascade,
  due text,
  include_project_descendants boolean not null default false,
  query text
);

create table view_filter_projects (
  view_id uuid not null references views(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  primary key (view_id, project_id)
);

create table view_filter_tags (
  view_id uuid not null references views(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (view_id, tag_id)
);

create table view_sorts (
  view_id uuid primary key references views(id) on delete cascade,
  active_key text not null,
  project_direction text not null,
  subject_direction text not null,
  due_direction text not null,
  priority_direction text not null
);

create table view_display_options (
  view_id uuid primary key references views(id) on delete cascade,
  show_completed boolean not null default false
);

create table tasks (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  priority integer,
  status text not null check (status in ('todo', 'done')),
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table task_attachments (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null,
  storage_key text not null,
  created_at timestamptz not null
);

create table task_comments (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  message text not null,
  created_at timestamptz not null
);

create table task_comment_attachments (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  task_comment_id uuid not null references task_comments(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null,
  storage_key text not null,
  created_at timestamptz not null
);

create table task_tags (
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table reminders (
  id uuid primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  remind_at timestamptz not null
);
```

補足:

- `Task.tag_ids` は配列のままより `task_tags` に分離した方が検索しやすい
- task 添付とコメント添付は、ファイル本体ではなくメタデータと `storage_key` を保持する
- コメントは task とは別テーブルに切り出し、1 task に複数ぶら下がる
- `task_comments` は `created_at` で時系列表示する
- コメントは編集のみ許可し、削除は許可しない
- `Task.reminders` も独立テーブルへ切り出す
- `Project.parent_id` は自己参照
- `system project` はユーザーごとに `Inbox` と `Done` を自動作成する
- `views` は将来的な検索性と変更追跡を考え、正規化テーブル寄りで持つ

## 6. 推奨移行段取り

### Phase 0: 意思決定

- DB access は `postgres` + 手書き SQL を採用する
- `@neondatabase/serverless` は現時点では採用せず、Edge runtime などが必要になった場合の補助候補とする
- migration は SQL ファイルで管理する
- 既存コードは repository/service 分離があるため、ORM 導入は必須ではない

### Phase 1: Neon 接続を追加

- Vercel Marketplace で Neon を追加する
- Vercel Marketplace の Neon は Native integration を使う
- `DATABASE_URL` と `DATABASE_URL_UNPOOLED` が Vercel に注入される構成にする
- `DATABASE_URL` は通常のアプリ query に使う
- `DATABASE_URL_UNPOOLED` は migration や管理系処理に使う
- ローカル `.env.local` に Neon 接続文字列を設定する

### Phase 2: DB スキーマ作成

- SQL ベースの migration 基盤を導入する
- `users`, `projects`, `tags`, `views`, `tasks`, `task_attachments`, `task_comments`, `task_comment_attachments`, `task_tags`, `reminders` を作る
- index を追加する

最低限推奨する index:

- `projects(owner_user_id, parent_id)`
- `tags(owner_user_id)`
- `views(owner_user_id)`
- `tasks(owner_user_id, project_id, status, due_date)`
- `task_attachments(task_id, created_at)`
- `task_comments(task_id, created_at)`
- `task_comment_attachments(task_comment_id, created_at)`
- `task_tags(tag_id, task_id)`

### Phase 3: Repository 抽象の差し替え

新規追加候補:

- `src/lib/db/client.ts`
- `src/lib/repositories/postgres-project-repository.ts`
- `src/lib/repositories/postgres-tag-repository.ts`
- `src/lib/repositories/postgres-view-repository.ts`
- `src/lib/repositories/postgres-task-repository.ts`

この段階では service API の shape は可能な限り維持しつつ、owner 管理や view 正規化で必要な箇所だけ再設計する方が安全です。

この phase では通常 CRUD だけでなく、以下も Neon 実装へ差し替える必要があります。

- `BootstrapService`
- `TestDataService`
- テストデータ生成が参照する repository stub / test fixture

### Phase 4: 認証と user 解決

- request 開始時に `requireSession()` を呼ぶ
- email から `users` を upsert し、アプリ内では `users.id` を正規の owner key にする
- repository や service に `owner_user_id` を渡す
- 初回ログイン時に `Inbox` / `Done` の system project を作成する

### Phase 5: 読み取りと書き込みを Neon に切り替える

- CRUD を Neon に切り替える
- conflict 制御は `version` カラムによる optimistic locking へ切り替える
- `/settings` のテストデータ生成も Neon repository を使うように切り替える
- 一覧件数、検索、view filter、task create/update/delete、test data generation の一連動作を確認する

### Phase 6: Drive 依存の削除

- `drive.appdata` scope を auth から外す
- `src/lib/drive/*` と Drive repository を削除する
- Drive 前提ドキュメントを更新する

## 7. 実際の実装手順

このリポジトリなら、実作業は次の順が安全です。

1. `pnpm add postgres`
2. migration 基盤を追加
3. `src/lib/db/client.ts` を追加
4. `users` 解決用 helper を追加
5. repository を Postgres 実装へ追加
6. service constructor に repository 差し替え点を用意
7. bootstrap を DB 初期化へ変更
8. `TestDataService` と `/settings` のテストデータ生成動作を Neon 実装へ切り替える
9. typecheck と test を通す
10. migration 実行手順を手動運用として明文化する

## 8. 問題点とリスク

### 8.1 一意制約

- `TagService` は現在、同一ユーザー内でタグ名重複を禁止している
- Neon では DB 制約で担保した方が良い
- `lower(name)` を使う unique index を入れないとアプリ実装とのズレが起こる

### 8.2 階層 project の削除

- いまは子孫 project を辿って task file ごと消す実装
- Postgres では `on delete cascade` とアプリ側の削除順序の両方を整合させる必要がある

### 8.3 reminder の扱い

- 現在は `Task.reminders` のネスト配列
- 今回の決定では独立テーブルへ移す
- 通知機能を将来的に追加する前提でも、この方針の方が拡張しやすい

### 8.4 テストデータ生成機能

- `/settings` のテストデータ生成は repository を直接またいで task を大量投入する
- 通常 CRUD が動いても、TestDataService が Drive 前提のままだと `/settings` だけ壊れる
- Neon 移行時は `ProjectRepository`, `TagRepository`, `TaskRepository` の切り替えとあわせて必ず検証対象に入れる必要がある

### 8.5 添付ファイル保存先

- Neon はメタデータ管理には適していますが、添付ファイル本体を大量に直接保持する用途には向きません
- そのため task 添付 / comment 添付の本体は Blob か object storage に置き、DB は `storage_key` とメタデータだけを持つ前提が安全です
- 現在の候補は `Vercel Blob` と `Cloudflare R2` です
- `Vercel Blob` は Vercel との統合が素直で実装が軽く、`Cloudflare R2` は S3 互換で将来の移植性と配信制御の自由度が高い、という違いがあります
- 現段階では運用を軽くする観点で `Vercel Blob` を暫定推奨とし、将来 S3 互換運用や配信制御要件が強くなった場合に `Cloudflare R2` を再評価するのが現実的です
- 保存先とアップロード権限をどう制御するかは先に確定が必要です

### 8.6 View 正規化

- `views.filters` / `views.sort` / `views.display_options` を正規化すると、実装量は `jsonb` より増える
- その代わり、RLS、一貫性制約、絞り込み条件の拡張、監査性では有利
- 既存 service は view を 1 オブジェクトとして扱っているため、repository 層で aggregate を組み立てる責任が増える

### 8.7 Preview 環境の共有運用

- Preview ごとに branch を分けないため、共有 preview 環境での schema 変更検証手順を明示する必要がある
- Preview build ごとの DB 分離がない分、migration 適用順序を誤ると複数 preview に影響が出る
- この前提では migration を build や CI に自動で組み込むより、共有環境に対して明示的に手動実行する方が安全です

## 9. 推奨する最小移行方針

最小で現実的なのは次です。

- DB client は `postgres`
- ORM は最初は入れない
- migration は SQL ファイル
- `views.filters` / `views.sort` / `views.display_options` は正規化寄りで持つ
- `tasks.tags` は `task_tags` join table にする
- user 識別は `users` テーブルを起点に `users.id` を使う
- conflict 制御は `version` カラムで実装する
- データ移行は行わず、Neon を新しい正規保存先として切り替える
- migration 実行は `その他: リリース前の手動実行` を基本とする

## 10. 実施前チェックリスト

- Vercel 上で Neon Native integration を有効化した
- `DATABASE_URL` と `DATABASE_URL_UNPOOLED` の運用ルールを決めた
- migration 実行コマンドを決めた
- Preview 環境の共有 DB 運用ルールを決めた
- `/settings` のテストデータ生成を Neon repository 上で検証する計画がある
- rollback 方針がある
- Google OAuth の Drive scope を外すタイミングを決めた

## 11. 実施後チェックリスト

- `/inbox`, `/project/[projectId]`, `/view/[viewId]`, `/settings` が正常表示
- task create/update/delete が正常
- project hierarchy が正常
- tag rename/delete の task 反映が正常
- view filter が現行と同じ結果を返す
- `/settings` のテストデータ生成が正常に task を投入できる
- conflict message が意図通り動く
- preview branch 作成時に schema mismatch が出ない

## 12. 実装優先順位

1. Neon 接続と migration 基盤
2. `users` と `projects/tags/views/tasks` の基本 schema
3. read path の repository 差し替え
4. write path の repository 差し替え
5. `TestDataService` と `/settings` のテストデータ生成対応
6. auth scope 整理
7. Drive 実装削除

## 13. ヒアリング回答を踏まえた推奨補足

### 13.1 DB 接続ライブラリ

- 現在のプロジェクトには `postgres` を推奨します
- 理由は、既存の repository / service 分離と相性がよく、SQL を明示的に保ったまま移行できるためです
- `@neondatabase/serverless` は現時点では採用せず、将来 Edge runtime や fetch ベース接続が必要になった時の補助候補として残すのが適切です

### 13.2 migration 実行タイミング

- 現段階では `その他: リリース前の手動実行` を推奨します
- 理由は、branch-per-preview を使わない前提では自動 migration の失敗や順序ミスが複数 preview に波及しやすいためです
- 運用としては、schema 変更を含むリリース前に担当者が共有環境へ migration を明示実行し、その成功確認後にアプリを反映する形が最もトラブルを抑えやすいです

## 14. 参考リンク

公式ドキュメント:

- Vercel CLI integration docs: https://vercel.com/docs/cli/integration/
- Neon: Connecting with the Neon-Managed Integration: https://neon.com/docs/guides/vercel/
- Neon: Connect Neon to your stack: https://neon.com/docs/get-started-with-neon/connect-neon
- Neon Branching overview: https://neon.com/flow/branches
- Neon branch-per-preview: https://neon.com/flow/branch-per-preview

このリポジトリ内の参照:

- `README.md`
- `technical-design.md`
- `src/auth.ts`
- `src/lib/auth/session.ts`
- `src/lib/repositories/drive-file-repository.ts`
- `src/lib/repositories/project-repository.ts`
- `src/lib/repositories/tag-repository.ts`
- `src/lib/repositories/view-repository.ts`
- `src/lib/repositories/task-repository.ts`
