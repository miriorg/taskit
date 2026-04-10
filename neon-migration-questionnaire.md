# Neon 移行ヒアリングシート

このドキュメントは、Google Drive 保存から Vercel Marketplace の Neon Postgres
へ移行する前に、決めておくべき事項を整理し、回答を書き込むためのものです。

- プロジェクト名:
- 作成日:
- 作成者:
- レビュー担当:

## 1\. 移行方針

### 1.1 移行の目的

- 目的: ストレージ速度の改善による使用感の向上
- 期待している効果:保存や読み込み速度向上による利用時の待ち時間の解消
- 今回の移行で解決したい問題: ストレージへの読み書き速度の改善

### 1.2 スコープ

- 今回の移行対象:
  - [x] project
  - [x] tag
  - [x] task
  - [x] view
  - [x] `/settings` のテストデータ生成
  - [x] 認証まわり
  - [x] Vercel デプロイ設定
  - [x] Preview 環境
- 今回の移行対象外:

### 1.3 データ移行要否

- 決定: 既存 Google Drive データの移行は行わない
- 補足:

## 2\. 認証とユーザー識別

### 2.1 認証方式

- 決定: Google ログインは継続する

### 2.2 ユーザー識別子

- 決定: `owner_user_id` は独立した `users.id` を参照する
- 理由:

### 2.3 users テーブル

- 決定: `users` テーブルを導入する

## 3\. データモデル

### 3.1 テナント分離

- 決定: 全主要テーブルに `owner_user_id` を持たせる
- 決定: テナント分離は PostgreSQL RLS を併用する
- 補足:

### 3.2 View の保存形式

- 決定: `views.filters` は正規化テーブルで保存する
- 決定: `views.sort` は正規化テーブルで保存する
- 決定: `views.display_options` は正規化テーブルで保存する
- 理由:

### 3.3 Tag と Task の関連

- 決定: `task.tag_ids` は中間テーブル `task_tags` で表現する
- 理由:

### 3.4 Reminder の保存形式

- 決定: `reminders` は独立テーブルで保存する
- 理由:

### 3.5 システムプロジェクト

- 決定: `Inbox` / `Done` はユーザーごとに自動作成する
- 決定: 作成タイミングは初回ログイン時とする

### 3.6 task 添付ファイルとコメント

- 決定: 1つの task には複数のファイルを添付できる
- 決定: task にはコメントを複数追記できる
- 決定: コメントは created_at と message を保持する
- 決定: 1つのコメントには複数のファイルを添付できる
- 決定: コメントはタスク詳細を表示すると記入時刻順に表示される
- 決定: 添付はファイル名をコメント表示欄右寄せで1行1ファイルで表示する。
- 決定: コメント表示時に添付画像はメッセージに続いてサムネイル表示する
- 決定: 添付ファイル本体の保存先は `Vercel Blob` とする
- 理由: Vercel との統合が素直で、現段階では実装と運用が最も軽いため
- 決定: コメントは編集のみ許可し、削除は許可しない
- 決定: 添付ファイルの最大サイズは 100MB とする
- 決定: 許可する拡張子 / MIME type は `pdf`, `jpg`, `tif`, `png`, `txt`, `md`, `doc`, `xls`
  , `ppt`, `ps1`, `psm`, `py` とする
- 決定: 1 task あたりの添付数上限はストレージ容量上限までとする
- 決定: 1 comment あたりの添付数上限はストレージ容量上限までとする

## 4\. 競合制御

### 4.1 保存競合の扱い

- 決定: 書き込み競合は `version` による optimistic locking で扱う
- 理由:

### 4.2 ユーザー向け挙動

- 決定: 競合時の UI は現状どおりエラー表示とする
- 補足:

## 5\. 実装方式

### 5.1 DB 接続ライブラリ

- 利用するライブラリ:
  - [x] `postgres`
  - [ ] `@neondatabase/serverless`
  - [ ] Drizzle ORM
  - [ ] Prisma
  - [ ] その他
- 選択肢の違い:
  - `postgres`: 軽量で素直な SQL 実装向きです。既存の repository/service
    分離と相性が良い一方、スキーマ定義や型付けは自前管理が増えます。
  - `@neondatabase/serverless`: Neon 向け最適化があり、serverless
    環境との親和性が高いです。一方でアプリ全体の設計はほぼ SQL ベースのままです。
  - `Drizzle ORM`: スキーマ定義、型安全、migration の一貫性が取りやすく、現実的な中間案です。一方で導入コストと学習コストは素の
    SQL より増えます。
  - `Prisma`: 開発体験は良いですが、現行コードの repository 主体構成に対してはやや大きめで、serverless 接続や
    generated client 運用を追加で考える必要があります。
  - `その他`: Kysely など他の query builder も候補になりますが、チーム標準がない場合は判断コストが増えます。
- 決定理由:
  現プロジェクトでは postgres を第一推奨とする。既存の repository / service 分離と最も相性がよく、ORM
  導入なしで保存先だけを Postgres に置き換えやすいため。
  SQL を明示的に管理でき、今回採用する SQL ファイル migration
  方針とも整合する。
  @neondatabase/serverless は将来 Edge runtime 等が必要になった場合の補助候補とする

### 5.2 migration ツール

- 採用する migration 方式:
  - [x] SQL ファイル
  - [ ] Drizzle migrations
  - [ ] Prisma migrations
  - [ ] その他
- 選択肢の違い:
  - `SQL ファイル`: 挙動が最も明示的で DB 依存機能も使いやすいです。一方で型やアプリコードとの同期は手動管理になります。
  - `Drizzle migrations`: Drizzle 採用時は自然な選択で、schema と migration を揃えやすいです。一方で
    Drizzle を採用しない場合はメリットが薄れます。
  - `Prisma migrations`: Prisma 採用時は管理しやすいですが、今回のように repository/service
    主体で軽量移行したい場合はやや大きめです。
  - `その他`: 既存 CI や社内標準に合わせられますが、追加学習コストが発生します。
- 決定理由:  複雑なデータ構造を持つ必要はないのでSQLで十分管理・追従できると判断

### 5.3 Repository 方針

- 決定: 既存 service 層は維持を基本としつつ、一部再設計する
- 理由: 必要に応じて柔軟に環境変更に追従する

## 6\. Vercel / Neon 運用

### 6.1 Marketplace integration

- 決定: Vercel Marketplace の Neon は Native integration を使う
- 理由:

### 6.2 環境変数

- 使用する接続文字列:
  - [ ] `DATABASE_URL`
  - [ ] `DATABASE_URL_UNPOOLED`
  - [x] 両方
- 選択肢の違い:
  - `DATABASE_URL`: 通常のアプリ query 用に使いやすい pooled 接続が前提になりやすく、serverless
    リクエスト処理向きです。
  - `DATABASE_URL_UNPOOLED`: migration や長めの接続、接続特性を明示したい処理で使い分けやすいです。
  - `両方`: アプリ本体と migration / 管理系ジョブを分けられるため、運用上は最も柔軟です。
- 用途の切り分け:
  - `DATABASE_URL`:
  - `DATABASE_URL_UNPOOLED`:
- 決定理由:こだわる理由がなければどちらかに絞る必要もないので用途に合わせて両方使うことにする

### 6.3 Preview 環境

- 決定: Preview ごとに Neon branch は分けない
- 決定: branch-per-preview は採用しない
- 理由:

### 6.4 migration 実行タイミング

- migration はいつ流すか:
  - [ ] ローカル手動
  - [ ] CI
  - [ ] Vercel build
  - [ ] deploy 後ジョブ
  - [x] その他
- その他: リリース前の手動実行
  現段階では CI / Vercel build / deploy後ジョブによる自動実行は採用せず、schema
  変更を含むリリース前に担当者が共有環境へ明示的に migration を適用する。
  branch-per-preview
  を採用しないため、自動化すると失敗や適用順ミスの影響が複数環境に波及しやすい。手動実行のほうがトラブルを抑えやすく、運用も軽い。

## 7\. テストデータ生成機能

### 7.1 対応要否

- 決定: `/settings` のテストデータ生成機能は今回の Neon 対応に含める
- 理由:

￥### 7.2 実装方針

- 決定: `TestDataService` は既存 service を維持し、Neon repository 対応を行う
- 補足:

### 7.3 検証方法

- テストデータ生成の確認項目:
  - [x] task 件数
  - [x] tag 付与
  - [ ] description 生成
  - [x] project 単位投入
  - [ ] 重複防止
  - [ ] その他
- 補足:

## 8\. ドキュメント更新

### 8.1 更新対象

- 更新が必要な文書:
  - [ ] `README.md`
  - [x] `technical-design.md`
  - [x] `build-spec.md`
  - [ ] 運用手順書
  - [ ] テスト手順書
  - [ ] その他

### 8.2 Auth scope

- 決定: `drive.appdata` scope は Drive 実装削除時に外す

## 9\. ロールアウト

### 9.1 リリース方式

- 決定: ロールアウトは一括切り替えとする
- 理由:

### 9.2 ロールバック

- 問題発生時の戻し方:
- ロールバック条件:
- ロールバック手順:

## 10\. 非機能要件

### 10.1 性能

- 保存速度に関する目標:
- 一覧表示速度に関する目標:
- 許容する初回応答時間:

### 10.2 可観測性

- 決定: 追加監視対象は `slow query` と `auth failure` を優先する
- ログ方針:

### 10.3 セキュリティ

- 決定: RLS を導入する
- 接続権限の分離は行うか:
  - [x] はい
  - [ ] いいえ
- 補足:

## 11\. 最終意思決定まとめ

### 決定事項

- 既存 Google Drive データの移行は行わない
- Google ログインは継続する
- `users` テーブルを導入し、`owner_user_id` は独立した `users.id` を参照する
- 全主要テーブルに `owner_user_id` を持たせ、RLS を併用する
- `views.filters` / `views.sort` / `views.display_options` は正規化テーブルで保存する
- task と tag の関連は `task_tags` 中間テーブルで表現する
- reminders は独立テーブルで保存する
- task には複数ファイルを添付できる
- task コメントは複数保持し、各コメントは `created_at` と `message` を持つ
- コメントにも複数ファイルを添付できる
- コメントは task 詳細上で記入時刻順に表示する
- コメント添付は右寄せで 1 行 1 ファイル表示し、画像はメッセージ直後にサムネイル表示する
- コメントは編集のみ許可し、削除は許可しない
- 添付ファイルの最大サイズは 100MB とする
- 添付ファイル種別は `pdf`, `jpg`, `tif`, `png`, `txt`, `md`, `doc`, `xls`, `ppt`, `ps1`, `
  psm`, `py` を許可する
- task / comment ごとの添付数上限はストレージ容量上限までとする
- `Inbox` / `Done` はユーザーごとに初回ログイン時に自動作成する
- 保存競合は `version` による optimistic locking で扱う
- 競合時の UI は現状どおりエラー表示とする
- service 層は維持を基本としつつ、一部再設計する
- Vercel Marketplace の Neon は Native integration を使う
- Preview ごとに Neon branch は分けず、branch-per-preview は採用しない
- `/settings` のテストデータ生成機能は今回の Neon 対応に含める
- `TestDataService` は既存 service を維持し、Neon repository 対応を行う
- `drive.appdata` scope は Drive 実装削除時に外す
- ロールアウトは一括切り替えとする
- 追加監視対象は `slow query` と `auth failure` を優先する
- 接続権限の分離は行う

### 未決事項

- ロールバック条件と手順の具体化
- 性能目標の数値化
- `Vercel Blob` のアップロード権限と配信方式の詳細設計

### 次のアクション

1.  Neon と `Vercel Blob` の接続設定を追加する
2.  migration と `Vercel Blob` を前提に実装順序を確定する
3.  `Vercel Blob` のアップロード権限と配信方式を設計する
4.  ロールバック条件と性能目標を具体化する
