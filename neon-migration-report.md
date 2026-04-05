# Google Drive から Vercel Marketplace の Neon Postgres へ移行するためのレポート

## 1. 結論

このリポジトリは、Google Drive `appDataFolder` に JSON ファイルを保存する構成から、Neon Postgres に十分移行可能です。

ただし、今回の移行は単なる保存先の差し替えではありません。現在は「Google ログインした各ユーザーの Drive に、そのユーザー専用データを保存する」モデルですが、Neon では「共有データベース上でユーザー単位にテナント分離する」モデルへ変わります。したがって、移行の本質は次の 3 点です。

1. Drive file repository を Postgres repository へ置き換える
2. `owner_user_id` を持つ multi-tenant データモデルへ移行する
3. Google OAuth の Drive 権限依存を外す

この順で進めれば、段階的に移行できます。

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

現行のデータモデルは次です。

- `Project`
  - `id`, `name`, `description`, `color`, `parent_id`, `system`, `created_at`, `updated_at`
- `Tag`
  - `id`, `name`, `description`, `created_at`, `updated_at`
- `Task`
  - `id`, `project_id`, `title`, `description`, `due_date`, `priority`, `status`, `tag_ids`, `reminders`, `created_at`, `updated_at`, `completed_at`
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

Neon は branch を作れるため、Vercel Preview ごとに独立 DB branch を使えます。スキーマ変更の検証には有利です。

ただし注意点があります。

- preview build で migration を必ず流す必要がある
- branch cleanup ルールを決める必要がある
- branch 名変更や role 削除で integration が壊れることがある

### 4.5 認証は Google のままでよいが Drive scope は不要になる

Google ログイン自体は継続可能です。ただし Drive 保存をやめた時点で `drive.appdata` scope は不要です。

変更点は次です。

- `src/auth.ts` の scope から `https://www.googleapis.com/auth/drive.appdata` を外す
- `src/lib/drive/*` と `src/lib/repositories/drive-file-repository.ts` を最終的に削除できる
- `api-error.ts` の Drive エラー文言は DB 系に置き換える

## 5. 想定ターゲット設計

推奨スキーマは次です。

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
  filters jsonb not null,
  sort jsonb not null,
  display_options jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
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

- `View.filters`, `View.sort`, `View.display_options` はまず `jsonb` で良い
- `Task.tag_ids` は配列のままより `task_tags` に分離した方が検索しやすい
- `Project.parent_id` は自己参照
- `system project` はユーザーごとに `Inbox` と `Done` を自動作成する

## 6. 推奨移行段取り

### Phase 0: 意思決定

- ORM を使うかを決める
- 推奨は軽量に `postgres` or `@neondatabase/serverless` + 手書き SQL、または Drizzle
- 既存コードは repository/service 分離があるため、ORM 導入は必須ではない

### Phase 1: Neon 接続を追加

- Vercel Marketplace で Neon を追加する
- 既存 Neon project を使うなら Neon-managed integration、Vercel から新規に持つなら Native integration を選ぶ
- `DATABASE_URL` と `DATABASE_URL_UNPOOLED` が Vercel に注入される構成にする
- ローカル `.env.local` に Neon 接続文字列を設定する

### Phase 2: DB スキーマ作成

- migration ツールを導入する
- `users`, `projects`, `tags`, `views`, `tasks`, `task_tags`, `reminders` を作る
- index を追加する

最低限推奨する index:

- `projects(owner_user_id, parent_id)`
- `tags(owner_user_id)`
- `views(owner_user_id)`
- `tasks(owner_user_id, project_id, status, due_date)`
- `task_tags(tag_id, task_id)`

### Phase 3: Repository 抽象の差し替え

新規追加候補:

- `src/lib/db/client.ts`
- `src/lib/repositories/postgres-project-repository.ts`
- `src/lib/repositories/postgres-tag-repository.ts`
- `src/lib/repositories/postgres-view-repository.ts`
- `src/lib/repositories/postgres-task-repository.ts`

この段階では service API の shape はあまり変えず、repository の実装だけ差し替える方が安全です。

### Phase 4: 認証と user 解決

- request 開始時に `requireSession()` を呼ぶ
- email から `users` を upsert する
- repository や service に `owner_user_id` を渡す

### Phase 5: データ移行

現行ユーザーの既存データが必要なら、1 回限りの import script を作ります。

手順:

1. 既存ユーザーでログイン
2. Drive の `project.json`, `tag.json`, `view.json`, `task-*.json` を読む
3. Neon に transaction 単位で投入する
4. `Inbox` / `Done` の system project を重複作成しない
5. import 後の件数検証を行う

### Phase 6: 読み取りを Neon に切り替える

- まず read path だけ Neon に寄せる
- write はまだ Drive に残す、または dual-write にする
- 一覧件数、検索、view filter の一致を確認する

### Phase 7: 書き込みを Neon に切り替える

- CRUD を Neon に切り替える
- conflict 処理を `version` ベースに変更する
- 問題なければ Drive write を停止する

### Phase 8: Drive 依存の削除

- `drive.appdata` scope を auth から外す
- `src/lib/drive/*` と Drive repository を削除する
- Drive 前提ドキュメントを更新する

## 7. 実際の実装手順

このリポジトリなら、実作業は次の順が安全です。

1. `pnpm add postgres` もしくは `pnpm add @neondatabase/serverless`
2. migration 基盤を追加
3. `src/lib/db/client.ts` を追加
4. `users` 解決用 helper を追加
5. repository を Postgres 実装へ追加
6. service constructor に repository 差し替え点を用意
7. bootstrap を DB 初期化へ変更
8. import script を `scripts/` に追加
9. typecheck と test を通す
10. Vercel Preview で migration 実行を組み込む

## 8. 問題点とリスク

### 8.1 既存データ移行

- 現在の production データが Drive にしかない
- 移行スクリプトの不備で一部欠損や重複が起こりうる
- 一度だけの移行なのか、しばらく dual-write 期間を持つのか決める必要がある

### 8.2 一意制約

- `TagService` は現在、同一ユーザー内でタグ名重複を禁止している
- Neon では DB 制約で担保した方が良い
- `lower(name)` を使う unique index を入れないとアプリ実装とのズレが起こる

### 8.3 階層 project の削除

- いまは子孫 project を辿って task file ごと消す実装
- Postgres では `on delete cascade` とアプリ側の削除順序の両方を整合させる必要がある

### 8.4 reminder の扱い

- 現在は `Task.reminders` のネスト配列
- そのまま jsonb でも動くが、将来的な通知機能を考えると分離テーブルの方が良い

### 8.5 preview branch と migration

- preview branch が自動生成されても schema が追随しないと壊れる
- build command に migration を組み込まないと preview が不安定になる

## 9. 推奨する最小移行方針

最小で現実的なのは次です。

- DB client は `postgres` 系の薄い接続ライブラリ
- ORM は最初は入れない
- `views.filters` などは `jsonb`
- `tasks.tags` だけ join table にする
- user 識別は最初は email ベースでも可
- ただし `users` テーブルは最初から入れる
- conflict 制御は `version` カラムで実装する

## 10. 実施前チェックリスト

- Vercel 上で Neon integration をどちらの方式で入れるか決めた
- `DATABASE_URL` と `DATABASE_URL_UNPOOLED` の運用ルールを決めた
- migration 実行コマンドを決めた
- preview deploy で migration が流れる
- import script の dry run がある
- 件数照合手順がある
- rollback 方針がある
- Google OAuth の Drive scope を外すタイミングを決めた

## 11. 実施後チェックリスト

- `/inbox`, `/project/[projectId]`, `/view/[viewId]`, `/settings` が正常表示
- task create/update/delete が正常
- project hierarchy が正常
- tag rename/delete の task 反映が正常
- view filter が現行と同じ結果を返す
- conflict message が意図通り動く
- preview branch 作成時に schema mismatch が出ない

## 12. 実装優先順位

1. Neon 接続と migration 基盤
2. `users` と `projects/tags/views/tasks` の基本 schema
3. read path の repository 差し替え
4. write path の repository 差し替え
5. import script
6. auth scope 整理
7. Drive 実装削除

## 13. 参考リンク

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
