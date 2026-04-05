# タスク管理Webサービス 仕様書

## 1. 概要

個人利用を想定した、シンプルかつ高機能なタスク管理Webサービス。
制限のないプロジェクト数、タグ数によるラベリング・フィルタリングの検索性を備える。

初期リリースでは、タスク管理の基本操作を優先し、AIタスク登録とリマインダー通知はMVP対象外とする。
キーボードショートカットは主要操作に限定して提供する。

## 1.1. Neon 移行方針メモ

Google Drive 保存から Neon Postgres へ移行する前提で、以下を決定済み事項として扱う。

- 既存 Google Drive データの移行は行わない
- Google ログインは継続する
- 永続化先は Neon Postgres とする
- `users` テーブルを導入し、アプリ内の所有者識別は独立した `users.id` を使う
- 全主要テーブルに `owner_user_id` を持たせる
- テナント分離は PostgreSQL RLS を併用する
- `task` と `tag` は中間テーブル `task_tags` で関連付ける
- `reminders` は独立テーブルで保持する
- 保存競合は `version` による optimistic locking で扱う
- service 層は維持を基本としつつ、一部再設計する
- Vercel Marketplace の Neon は Native integration を使う
- Preview ごとに Neon branch は分けず、branch-per-preview は採用しない
- `Inbox` / `Done` はユーザーごとに初回ログイン時に自動作成する
- `/settings` のテストデータ生成機能も Neon 対応対象に含める
- `TestDataService` は既存 service を維持し、Neon repository 対応を行う
- ロールアウトは一括切り替えを前提とする
- `drive.appdata` scope は Drive 実装削除時に外す
- 追加監視対象は `slow query` と `auth failure` を優先する
- task コメントは時刻順表示とし、編集のみ許可、削除は許可しない
- 添付ファイルの最大サイズは 100MB とし、許可種別は `pdf`, `jpg`, `tif`, `png`, `txt`, `md`, `doc`, `xls`, `ppt`, `ps1`, `psm`, `py` とする
- task / comment ごとの添付数上限はストレージ容量上限までとする
- DB 接続文字列は `DATABASE_URL` と `DATABASE_URL_UNPOOLED` の両方を使い分ける
- アプリ本体の通常 query は pooled な `DATABASE_URL` を使う
- migration や接続特性を明示したい管理処理は `DATABASE_URL_UNPOOLED` を使う
- migration 管理は SQL ファイルを採用する
- DB access は repository / service 分離を維持しつつ、手書き SQL を基本に進める
- DB 接続ライブラリは `postgres` を採用する
- `@neondatabase/serverless` は現時点では採用せず、将来 Edge runtime などが必要になった場合の補助候補とする
- migration 実行は `その他: リリース前の手動実行` を採用する

未決事項:

- 添付ファイル本体の保存先を `Vercel Blob` と `Cloudflare R2` のどちらにするか
- ロールバック条件と手順の具体化
- 性能目標の数値化

## 2. 機能要件

### 2.1. ユーザー認証

- **認証方式:** Googleアカウントによるソーシャル認証に限定する。
- メールアドレスとパスワードによる認証は実装しない。
- Google Drive へのアクセスはアプリ専用フォルダに限定する。
- ユーザーの通常ファイル一覧や任意ファイルにはアクセスしない。
- 退会時はアプリ専用フォルダ内の保存データも削除対象とする。

### 2.2. データ永続化

- **保存先:** Neon Postgres。
- 認証ユーザーごとのデータは共有 DB 上で `owner_user_id` により分離する。
- 全主要テーブルは `owner_user_id` を持ち、PostgreSQL RLS を併用する。
- `users` テーブルを導入し、アプリ内の所有者識別は独立した `users.id` を使う。
- `project`, `tag`, `task`, `view` はテーブル単位で管理し、JSON ファイル分割保存は廃止する。
- `task` と `tag` の関連は `task_tags` 中間テーブルで表現する。
- `reminders` は独立テーブルで管理する。
- `views.filters`, `views.sort`, `views.display_options` は正規化テーブルで管理する。
- 書き込み競合は `version` カラムによる optimistic locking で判定する。
- 競合時は自動上書きせず、現状どおりエラー表示と再読み込み導線を表示する。
- 一覧取得、競合判定、認可、整合性の責務はすべてサーバ API 側が持つ。

### 2.3. タスク管理

- **タスクの構成要素:**
  - **必須:** タイトル
  - **任意:** 備考, 期限, 優先度, プロジェクト, リマインダー, タグ, 添付ファイル, コメント
- **状態:** 「未完了(todo)」と「完了(done)」の2状態のみで管理する。
- **優先度:** 0から9までの10段階。非必須項目とし、アプリケーション側では数値の大小以外の意味は持たせない。
- **日付:** 「期限」のみとし、「開始日」のような概念は設けない。
- **デフォルトの並び順:** 期限順。
- 1つのタスクには複数のファイルを添付できる。
- タスクにはコメントを複数追記できる。
- コメントは追記時刻とメッセージを保持する。
- 1つのコメントには複数のファイルを添付できる。
- コメントはタスク詳細上で記入時刻順に表示する。
- コメント添付はコメント表示欄の右側に 1 行 1 ファイルで表示する。
- コメント添付が画像の場合は、メッセージに続けてサムネイル表示する。
- コメントは編集のみ許可し、削除は許可しない。
- 添付ファイルの最大サイズは 100MB とする。
- 許可する添付種別は `pdf`, `jpg`, `tif`, `png`, `txt`, `md`, `doc`, `xls`, `ppt`, `ps1`, `psm`, `py` とする。
- 1 task あたり、および 1 comment あたりの添付数上限はストレージ容量上限までとする。
- 添付ファイルはファイル本体を外部ストレージに置き、タスク側ではメタデータと保存先キーを保持する前提で設計する。
- 完了タスクは未完了タスクとは別セクションに分け、通常表示では視界から排除しやすくする。
- タスクを完了にした際は、「完了」固定プロジェクトへ移動して無期限保存する。
- 完了タスクを `Reopen` した際は、`インボックス` へ移動して未完了状態へ戻す。
- 完了タスクの自動アーカイブ、自動削除は行わない。
- 完了日時の変更履歴は保持しない。

### 2.4. プロジェクト管理

- プロジェクトは無制限に作成可能。
- **構成要素:** プロジェクト名, プロジェクトカラー, 親プロジェクト。
- 親子関係による階層構造をサポートする。
- 親プロジェクトを表示した際は、子プロジェクト配下のタスクも集約表示する。
- プロジェクト画面には `子プロジェクトを含める` チェックボックスを配置し、既定値は `ON` とする。
- `子プロジェクトを含める` が `OFF` の場合は、当該プロジェクト自身のタスクのみを表示する。
- プロジェクト編集画面からサブプロジェクトを追加できるようにする。
- 通常の新規プロジェクト作成時は、プロジェクトカラーの初期値を白(`#ffffff`)とする。
- サブプロジェクト作成時は、現在表示中のプロジェクトを親とし、親のカラーコードを初期値として継承する。
- プロジェクト編集画面には親プロジェクトを変更するドロップダウンを配置する。
- 親プロジェクト候補からは、自分自身、子孫プロジェクト、`インボックス`、`完了` を除外する。
- プロジェクト一覧は親子関係が分かるインデント付きツリー表示とする。
- プロジェクト削除時は、配下の子プロジェクトおよびタスクもまとめて削除する。
- **固定プロジェクト:** 「インボックス」は削除不可・名称変更不可とする。
- **固定プロジェクト:** 「完了」は完了済みタスクの保存先として扱い、削除不可・名称変更不可とする。
- タスクがどのプロジェクトにも属さない場合は「インボックス」に配置する。

### 2.5. タグ管理

- タグは無制限に作成可能。
- 1つのタスクに複数のタグを付与できる。
- タグに親子関係は設定できない。
- タグ名は一意とする。
- タグによる絞り込み検索を必須機能とする。

### 2.6. ビューとフィルタ

- 保存ビュー機能を提供する。
- 少なくとも以下のビューを扱えるようにする。
  - 今日
  - 期限切れ
  - タグ別
  - プロジェクト別
- プロジェクト条件とタグ条件を組み合わせたフィルタを保存可能にする。
- 保存ビューは `名前 + 条件 + ソート + 表示オプション` を保持できるようにする。
- 保存ビューの公開範囲は個人利用前提のため、作成ユーザー本人のみとする。

### 2.7. AIによるタスク登録支援

- 将来的に自然言語入力を AI が解析し、タイトル、備考、期限、プロジェクト、タグ等を補助入力する機能を提供する。
- **MVP対象外** とする。
- AI が解釈できなかった場合は、少なくともタイトルだけを登録確認画面に引き継ぐ。
- AI によるプロジェクト新規作成、タグ新規作成は許可しない。
- 使用するモデルはユーザーが選択する ChatGPT 系モデルを前提とする。
- API キーはユーザー自身が登録したものを利用し、利用コスト管理もユーザー責任とする。

### 2.8. UI/UX

- 主要な操作はキーボードショートカットで実行可能とする。
- MVP時点では、少なくともタスク追加、編集、完了、ビュー切り替えを対象とする。
- UI上にはリマインダー入力パーツを配置するが、MVPでは動作させない。
- 競合発生時は対象種別ごとの文言をインライン表示し、`Reload latest data` 導線と未保存変更が失われる注意文を併記する。
- `Projects`, `Tags`, `Views` の新規追加は、各セクションの追加ボタンからモーダルダイアログを開いて行う。
- `Project`, `Task`, `View` の編集はモーダルダイアログを基本とする。
- タスクのタイトル欄および説明欄では、単体の `#` または `＃` 入力をトリガとしてインラインのタグ候補選択 UI を開けるようにする。
- 配色テーマ機能を将来的に提供できるようにする。
- 初期実装では複数の候補テーマを内部的に保持し、デフォルトテーマは `Mist Blue` とする。
- 将来的にはシステム設定画面からテーマを選択可能にする。

### 2.10. MVP後のUI改善メモ

- タスク一覧の `Complete` は行左端のチェックボックスへ変更し、完了状態をそのまま視覚化する。
- タスク一覧の `Edit` は `Delete` の左側へ配置し、ペンアイコンの正方形ボタンへ変更する。
- タスク一覧の `Delete` は行右端へ配置し、ゴミ箱アイコンの正方形ボタンへ変更する。
- タスク一覧のタスク間隔は現状より狭くし、一覧密度を上げる。
- `Reload latest data` ボタンは競合解消導線として、より重要度の高い配色へ変更する。
- タスク登録・編集領域、ビュー登録・編集領域におけるタグ選択UIは、大量タグ前提の運用を想定する。
- 選択済みタグは現行の視覚表現を維持する。
- 未選択タグの追加は、検索可能な入力欄付きプルダウンコンボボックスで行う。
- タスク編集画面での `Add SubTask` は MVP 後の機能とする。
- UI 文言は将来的に翻訳対応できるよう、辞書キー方式へ移行する。
- `ja / en` などのロケール辞書ファイルを導入できる構造へ改修する。
- API エラー文言は `message` 直書きではなく `code` ベースで翻訳する構造へ移行する。
- 主要画面コンポーネント内の直書き文言は段階的に外出しする。

### 2.9. リマインダー

- タスクに対して複数のリマインダーを設定可能な前提でUIとデータ構造を持たせる。
- **MVP対象外** とする。
- 再開指示があるまで、実際の通知処理は実装しない。

## 3. 非機能要件

### 3.1. 実行環境

- **デプロイ先:** Vercel。

### 3.2. API

- v1 では外部公開APIは提供しない。
- 将来的な外部公開API追加を見据え、APIトークン認証を想定する。
- Web UI 内部用のAPIはサーバAPI型とする。
  - 一覧取得、詳細取得、更新前チェックを含むデータアクセスはサーバAPI経由で実行する。
  - ブラウザから DB やオブジェクトストレージを直接操作しない。
  - Neon への query、競合判定、認可、保存確定はサーバAPI側で一元管理する。
  - 添付ファイル本体のアップロード権限もサーバAPI側で制御する。

## 4. データモデル

### 4.1. Neon 上の主要テーブル

```text
users
projects
tags
views
view_filters
view_filter_projects
view_filter_tags
view_sorts
view_display_options
tasks
task_tags
task_attachments
task_comments
task_comment_attachments
reminders
```

### 4.2. `tags` テーブル行イメージ

```json
{
  "id": "tag_uuid_1",
  "owner_user_id": "user_uuid_1",
  "name": "重要",
  "created_at": "2026-03-18T12:00:00Z",
  "updated_at": "2026-03-21T10:00:00Z",
  "version": 3
}
```

### 4.3. `projects` テーブル行イメージ

```json
{
  "id": "proj_uuid_1",
  "owner_user_id": "user_uuid_1",
  "name": "仕事",
  "color": "#ff8080",
  "parent_id": null,
  "system": false,
  "created_at": "2026-03-18T12:00:00Z",
  "updated_at": "2026-03-21T10:00:00Z",
  "version": 2
}
```

### 4.4. `tasks` 集約イメージ

```json
{
  "task": {
    "id": "task_uuid_1",
    "owner_user_id": "user_uuid_1",
    "project_id": "proj_uuid_1",
    "title": "仕様書を更新する",
    "description": "ヒアリング内容を元に更新する",
    "due_date": "2026-03-20T10:00:00Z",
    "priority": 7,
    "status": "todo",
    "created_at": "2026-03-18T12:00:00Z",
    "updated_at": "2026-03-21T10:00:00Z",
    "completed_at": null,
    "version": 4
  },
  "tags": [
    {
      "tag_id": "tag_uuid_1"
    }
  ],
  "attachments": [
    {
      "id": "task_file_uuid_1",
      "file_name": "spec-v2.pdf",
      "content_type": "application/pdf",
      "byte_size": 245760,
      "storage_key": "task/task_uuid_1/spec-v2.pdf",
      "created_at": "2026-03-18T12:30:00Z"
    }
  ],
  "comments": [
    {
      "id": "task_comment_uuid_1",
      "message": "初稿を添付しました",
      "created_at": "2026-03-18T13:00:00Z",
      "attachments": [
        {
          "id": "task_comment_file_uuid_1",
          "file_name": "review-notes.txt",
          "content_type": "text/plain",
          "byte_size": 2048,
          "storage_key": "task-comments/task_comment_uuid_1/review-notes.txt",
          "created_at": "2026-03-18T13:00:00Z"
        }
      ]
    }
  ],
  "reminders": []
}
```

### 4.5. `views` 集約イメージ

```json
{
  "view": {
    "id": "view_uuid_1",
    "owner_user_id": "user_uuid_1",
    "name": "今日",
    "created_at": "2026-03-18T12:00:00Z",
    "updated_at": "2026-03-21T10:00:00Z",
    "version": 2
  },
  "filters": {
    "due": "today",
    "project_ids": [],
    "tag_ids": []
  },
  "sort": {
    "active_key": "due",
    "project_direction": "asc",
    "subject_direction": "asc",
    "due_direction": "asc",
    "priority_direction": "desc"
  },
  "display_options": {
    "show_completed": false
  }
}
```

## 5. 要確認事項

### 5.1. Neon 移行後に考慮が必要な点

- タスク移動や完了処理は複数テーブル更新になるため、transaction で整合性を保つ必要がある。
- プロジェクト削除時は、子プロジェクト、task、view 条件参照の cascade とアプリ側検証を整合させる必要がある。
- 保存ビューを正規化テーブルで持つため、repository 層で aggregate を組み立てる責務が増える。
- 親プロジェクト集約表示や「今日」「期限切れ」表示では、SQL の join と filter 条件設計が性能に直結する。
- Preview ごとに DB branch を分けないため、migration 適用順序を明示管理する必要がある。
- 添付ファイル本体は DB 外保存になるため、アップロード権限と配信方式の設計が必要になる。

### 5.2. 未確定事項

- 添付ファイル本体の保存先をどこにするか
- 添付ファイルのダウンロード URL を直リンクにするか、署名付き URL にするか

### 5.3. Neon 移行時の実装推奨

- 現行の repository / service 分離を活かすため、DB access は `postgres` + 手書き SQL を採用する。
- `@neondatabase/serverless` は現時点では採用せず、Edge runtime や fetch ベース接続が必要になった場合のみ補助候補とする。
- migration は SQL ファイルで管理し、DDL を明示的にレビューできる形を維持する。
- migration 実行タイミングは `その他: リリース前の手動実行` を採用し、schema 変更を含むリリース前に担当者が共有環境へ明示的に適用する。
- 理由は、branch-per-preview を使わない前提では schema 変更の自動適用が複数 preview に波及しやすく、CI / Vercel build / deploy 後ジョブより手動実行の方がトラブルを抑えやすいためである。

### 画面レイアウトに関連する要素

- プロジェクト名の表示方法
ルートプロジェクトの場合: [Root Project Name]
サブプロジェクトの場合:   [Root Project Name]/[Parent Project Name]/[Current Project Name]
表示しきれない程の深ネストのプロジェクト: [Root Project Name]...[Parent Project Name]/[Current Project Name]
※区切りの「/」を[...]に置き換えて省略を現す
※省略時はRoot寄りのプロジェクト名を省略するようにする
※以降、このルールを適用したプロジェクト名の表示を[Project]と記述する

- タグ選択領域
  検索(タグ名に入力文字が含まれるか否か(大文字小文字無視))してタグを選べるようにする
  - 全く選択されていないとき
  タグをフィルタ検索できる入力領域のみ表示する
  - 選択されているタグがあるとき
  [✅TAG1 ✅TAG2 ✅TAG3 ✅TAG4 🏷️[input area] ]
  表示されているタグのチェックを外すとタグの選択をキャンセルしたことになる
- 文字入力によるタグ選択
  [🏷️[A_]]
  [   [Android] [Android SDK] [Android Test]   ]
  入力した文字の下にヒットした複数のタグ候補を表示する
  ヒットする物がなければ何も表示しない
  候補表示時に[Enter]もしくは[Tab]が入力されたら先頭候補のタグに確定
  タグ入力時に[Esc]が入力されたらタグ選択をキャンセルして入力文字列を消去する
  ※'_'はキャレット
- ここまでのタグ選択領域の機能をこれ以降では[Tag Cloud]と表現する

- ソートについて
ソート機能は次の内容をボタン表示する。
昇順:▲/降順:▼+ソート項目名
例: ▼Project Order
アクティブ色で、現在のソート状況を表現し、インアクティブ色で他に選択可能なソート要素を提供する
アクティブ色のボタンを再度クリックしたときは、昇順:降順を切り替える
インアクティブ色のボタンを繰り育したときは該当要素の昇順にソートしてアクティブに切り替える

- タスク一覧表示のレイアウト(Project Order以外)
最上部にソートボタンを配置し、タスク毎にProjectを表示する形式で表示する
✅はチェックボックスで、通常は終了していないので□で表示され、チェックして✅にするとCompleteボタンを押したことと同じになる
<🖋><🗑️>の部分はタスク描画領域の右寄せで配置される
タスクの領域色は紐付けられているプロジェクトカラーにセットされる

```markdown
<[▲▼]Project Order><[▲▼]Subject Order><[▲▼]Due Order><[▲▼]Priority Order>
✅[Task Title]
  [Prefix of Description]                                  [🖋][🗑️]
  [Due][Tag Cloud]
  [Project]
✅[Task Title]
  [Prefix of Description]                                  [🖋][🗑️]
  [Due][Tag Cloud]
  [Project]
✅[Task Title]
  [Prefix of Description]                                  [🖋][🗑️]
  [Due][Tag Cloud]
  [Project]
```

- タスク一覧表示のレイアウト(Project Orderの場合)

最上部にソートボタンを配置し、Project毎にグルーピングする形式で表示する

```markdown
<[▲▼]Project Order><[▲▼]Subject Order><[▲▼]Due Order><[▲▼]Priority Order>
[▼▶][Project]
✅[Task Title]
  [Prefix of Description]                                  [🖋][🗑️]
  [Due][Tag Cloud]
✅[Task Title]
  [Prefix of Description]                                  [🖋][🗑️]
  [Due][Tag Cloud]
[▼▶][Project]
✅[Task Title]
  [Prefix of Description]                                  [🖋][🗑️]
  [Due][Tag Cloud]
```

- タスク追加領域

以下の様に入力フォームを用意する

```markdown
[New Task                                                         ]
[New Description                                                  ]
[Due YYYY/MM/DD HH:MM <📅> ][Priority▼]
[Tag Cloud]
```

- ルートプロジェクト追加導線

`Projects` セクション右上に追加ボタンを配置し、押下時にプロジェクト作成モーダルを開く。
通常の新規プロジェクト作成時のカラー初期値は白(`#ffffff`)とする。

- プロジェクト設定編集領域

`[🖋]` ボタンでプロジェクトを編集するときはブラウザウィンドウ中央にサブウィンドウを開き、プロジェクト編集画面を表示する。
以下の様に入力フォームを用意する。

```markdown
[Project Name][Color]<💾><🗑️>
[Sub Project Name]<Add Sub Project>
[Parent Project Dropdown]
```

[Project Name]：現在のプロジェクト名がセットされる。
[Color]：プロジェクトのカラーを設定する
<💾>：現在の入力状態でプロジェクト設定を保存する
<🗑️>：適切な警告後、プロジェクトを削除する
[Sub Project Name]：作成するサブプロジェクト名
<Add Sub Project>：クリックするとサブプロジェクトを追加するボタン
[Parent Project Dropdown]：親プロジェクトの切替先候補を表示するドロップダウン(自分自身、子孫、インボックス、完了は除く)

- タスク検索

タスク検索用文字列の入力欄と検索・クリア操作は、プロジェクト設定モーダルとは別に、メイン領域ヘッダに配置する。

- タスクの編集
  [🖋]ボタンでタスクを編集するときはブラウザウィンドウ中央にサブウィンドウを開き、タスク編集画面を表示する。

以下の様に入力フォームを用意する

```markdown
[Task Title                                                       ]
[Task Description                                                 ]
[Due YYYY/MM/DD HH:MM <📅> ][Project▼][Priority▼]
[Tag Cloud]
```

[Task Title]：Taskに設定されているタイトル
[Task Description]：Taskに設定されているDescription
[Due YYYY/MM/DD HH:MM <📅> ]：Taskに設定されている期限、日付の直接入力も可能だが<📅>ボタンによるカレンダー選択も可能
[Project▼]：Taskの移動先プロジェクトを選択する
[Priority▼]：Taskに設定されている優先度
[Tag Cloud]：Taskに設定されているTagの一覧

- タグ入力ショートカット

タスクの `Title` および `Description` 入力中に単体の `#` または `＃` を入力すると、その位置を起点にタグ候補選択 UI を開く。
候補表示時は以下の操作を行える。

- `Enter` または `Tab`：先頭候補を確定
- `Esc`：タグ選択をキャンセルし、入力中のタグ文字列を破棄
