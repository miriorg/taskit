# タスク管理Webサービス 技術設計書

## 1. 目的

本書は [build-spec.md](C:\Users\miri\git\codex\taskit\build-spec.md) を基に、実装に必要な技術方針、構成、責務分離、データアクセス方式、API設計、画面責務を定義する。

対象は MVP 実装であり、AIタスク登録支援とリマインダー通知の本実装は含めない。

## 2. システム構成

### 2.1. 採用構成

- フロントエンドとサーバAPIを同一アプリ内で提供する。
- デプロイ先は Vercel とする。
- アプリケーション層は以下の3層で構成する。
  - プレゼンテーション層: Web UI
  - アプリケーション層: サーバAPI、認可、ユースケース
  - インフラ層: Google OAuth、Google Drive API

### 2.2. 推奨技術スタック

- フレームワーク: Next.js App Router
- 言語: TypeScript
- UI: React
- 認証: Auth.js もしくは NextAuth.js
- バリデーション: Zod
- 日付処理: date-fns
- HTTPクライアント: fetch
- 状態管理:
  - サーバ状態: TanStack Query
  - ローカルUI状態: React state
- テスト:
  - 単体テスト: Vitest
  - UIテスト: Testing Library
  - E2E: Playwright

## 3. アーキテクチャ方針

### 3.1. 基本方針

- ブラウザは Google Drive API を直接操作しない。
- Google Drive への実アクセスはすべてサーバAPI経由とする。
- データ整合性、競合判定、Drive ファイル管理はサーバ側に集約する。
- フロントエンドは「画面状態」と「ユーザー操作」に責務を限定する。

### 3.2. 責務分離

#### フロントエンドの責務

- 画面描画
- 入力補助
- キーボードショートカット処理
- APIレスポンスの表示
- 競合発生時のインラインメッセージ表示

#### サーバAPIの責務

- セッション確認
- Google OAuth トークンの取得と更新
- Google Drive のアプリ専用フォルダ管理
- JSON ファイルの検索、取得、更新、作成、削除
- 各種業務ルールの適用
- 競合判定
- タスク移動やプロジェクト削除など複数ファイル更新処理

#### Google Drive の責務

- ユーザーデータの永続化
- ファイルの更新時刻管理
- アプリ専用フォルダへの保存

## 4. ディレクトリ設計

```text
src/
  app/
    (auth)/
    api/
      bootstrap/
      tasks/
      projects/
      tags/
      views/
      search/
    inbox/
    project/[projectId]/
    view/[viewId]/
    settings/
    layout.tsx
    page.tsx
  components/
    task/
    project/
    tag/
    view/
    layout/
    keyboard/
  features/
    tasks/
    projects/
    tags/
    views/
    auth/
  lib/
    auth/
    drive/
    repositories/
    services/
    validators/
    utils/
  types/
```

## 5. 認証設計

### 5.1. 認証フロー

1. ユーザーが Google ログインを実行する。
2. サーバ側で Google OAuth を完了する。
3. 必要なアクセストークン、リフレッシュトークンをサーバ側セッションに保持する。
4. 初回ログイン時に Google Drive のアプリ専用フォルダを作成する。
5. 初期ファイルが存在しなければ `project.json` `tag.json` `view.json` `task-[inbox-id].json` `task-[done-id].json` を作成する。

### 5.2. 必要スコープ

- Google ログイン用スコープ
- Google Drive アプリ専用フォルダアクセス用スコープ

通常ファイル一覧へアクセス可能な広いスコープは採用しない。

## 6. Google Drive 保存設計

### 6.1. アプリ専用フォルダ

- 各ユーザーに1つのアプリ専用フォルダを作成する。
- フォルダ内のファイル名は固定ルールに従う。
- ファイルIDはサーバ側でキャッシュ可能だが、Drive 側の実体確認を優先する。

### 6.2. 保存ファイル

- `project.json`
  - プロジェクトマスタ
- `tag.json`
  - タグマスタ
- `view.json`
  - 保存ビュー定義
- `task-[project-id].json`
  - プロジェクト単位のタスク集合

### 6.3. ファイル管理方針

- JSON構造はファイル単位で `schema_version` を持つ。
- 将来のスキーマ変更に備え、サーバ起動時ではなくアクセス時にマイグレーション判定を行う。
- JSON全体の妥当性検証を毎回サーバ側で実施する。
- 不正データ検出時は破損扱いとして保存せず、読み取り専用エラーを返す。

## 7. ドメインモデル

### 7.1. Task

```ts
type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: number | null;
  status: "todo" | "done";
  tag_ids: string[];
  reminders: Reminder[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
```

### 7.2. Project

```ts
type Project = {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  system: boolean;
  created_at: string;
  updated_at: string;
};
```

### 7.3. Tag

```ts
type Tag = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};
```

### 7.4. View

```ts
type View = {
  id: string;
  name: string;
  filters: ViewFilters;
  sort: ViewSort;
  display_options: ViewDisplayOptions;
  created_at: string;
  updated_at: string;
};
```

#### ソート UI 再設計方針

- `View.sort` は単一の `field + direction` ではなく、タスク一覧ヘッダの4ボタン UI を表現できる状態へ拡張する。
- 対象は `Project Order / Subject Order / Due Order / Priority Order` の4種とする。
- `Project Order` はソートだけでなく `Project ごとのグルーピング表示` を伴うため、一覧描画モード切替のトリガーとして扱う。
- 具体的な状態モデル、遷移、互換移行は [sort-ui-design.md](/C:/Users/miri/git/codex/taskit/sort-ui-design.md) を正とする。

### 7.5. Reminder

```ts
type Reminder = {
  id: string;
  remind_at: string;
};
```

MVPでは `Reminder` は保存対象外とし、UIダミー値として扱うか、空配列固定とする。

## 8. リポジトリ設計

### 8.1. Repository 一覧

- `DriveFileRepository`
  - Drive上のファイル検索、取得、更新、削除
- `ProjectRepository`
  - `project.json` の読書き
- `TagRepository`
  - `tag.json` の読書き
- `ViewRepository`
  - `view.json` の読書き
- `TaskRepository`
  - `task-[project-id].json` の読書き

### 8.2. Service 一覧

- `BootstrapService`
  - 初回ログイン時の初期ファイル作成
- `TaskService`
  - タスク作成、更新、完了、移動、削除
- `ProjectService`
  - プロジェクト作成、更新、削除、階層展開
- `TagService`
  - タグ作成、更新、削除、重複名検証
- `ViewService`
  - 保存ビュー作成、更新、削除、条件適用
- `ConflictDetectionService`
  - Drive更新時刻比較と競合判定

## 9. 競合制御設計

### 9.1. 競合判定方式

- クライアントは読み込み時にレスポンスに含まれる `revision` を保持する。
- `revision` はサーバ側で Drive の `modifiedTime` などから構成する。
- 更新系API呼び出し時にクライアントは対象ファイルの `revision` を送る。
- サーバ側は保存直前に現在の Drive 情報と照合する。
- 不一致なら `409 Conflict` を返し、上書き確認用情報を返す。

### 9.2. 競合対象

- `project.json`
- `tag.json`
- `view.json`
- `task-[project-id].json`

### 9.3. 上書き確認UI

- 競合時は対象フォーム付近にインラインメッセージを表示する。
- 文言は `task / project / view / tag` ごとに出し分ける。
- `Reload latest data` ボタンと `再読み込みすると未保存の変更は失われます。` の注意文を併記する。
- 初期実装では差分マージは行わない。
- 初期実装では明示的な上書き保存は提供せず、再読み込み後に再入力させる。

## 10. API設計

### 10.1. 共通方針

- すべて JSON API とする。
- 認証済みセッション必須。
- エラーレスポンス形式を統一する。

```json
{
  "error": {
    "code": "conflict",
    "message": "The target file has been updated.",
    "details": {}
  }
}
```

### 10.2. 初期化API

- `POST /api/bootstrap`
  - アプリ専用フォルダと初期ファイルを作成する

### 10.3. タスクAPI

- `GET /api/tasks`
  - 条件指定でタスク一覧を取得する
- `POST /api/tasks`
  - タスクを作成する
- `PATCH /api/tasks/:taskId`
  - タスクを更新する
- `POST /api/tasks/:taskId/complete`
  - タスクを完了し、完了プロジェクトへ移動する
- `POST /api/tasks/:taskId/uncomplete`
  - 必要なら元プロジェクトへ戻す。MVPでは未対応でも可
- `POST /api/tasks/:taskId/move`
  - 別プロジェクトへ移動する
- `DELETE /api/tasks/:taskId`
  - タスクを削除する

### 10.4. プロジェクトAPI

- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`

### 10.5. タグAPI

- `GET /api/tags`
- `POST /api/tags`
- `PATCH /api/tags/:tagId`
- `DELETE /api/tags/:tagId`

### 10.6. ビューAPI

- `GET /api/views`
- `POST /api/views`
- `PATCH /api/views/:viewId`
- `DELETE /api/views/:viewId`
- `POST /api/views/:viewId/query`
  - ビュー条件を適用したタスク一覧を取得する

### 10.7. 検索API

- `GET /api/search`
  - タイトル、備考、タグ、プロジェクトによる検索

## 11. 一覧取得設計

### 11.1. 基本方針

- Drive上の複数ファイルをサーバ側で集約して一覧を返す。
- フロントエンドは集約済みデータを受け取る。
- 親プロジェクト表示、期限別表示、タグ別表示はすべてサーバ側でフィルタする。

### 11.2. 一覧取得の流れ

1. `project.json` `tag.json` `view.json` を取得する。
2. 対象条件に必要な `task-[project-id].json` を列挙する。
3. 該当ファイルを読み込む。
4. タスク配列をフラット化する。
5. 条件適用、並び替え、完了分離を行う。
6. 画面表示用 DTO に変換して返す。

### 11.3. DTO例

```ts
type TaskListItemDto = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: number | null;
  status: "todo" | "done";
  project: {
    id: string;
    name: string;
    color: string;
  };
  tags: Array<{
    id: string;
    name: string;
  }>;
};
```

## 12. 更新処理設計

### 12.1. タスク作成

1. 入力バリデーション
2. プロジェクト存在確認
3. `task-[project-id].json` 取得
4. 競合判定
5. タスク追加
6. ソートに必要な値を整形
7. Driveへ保存

### 12.2. タスク移動

1. 移動元ファイル取得
2. 移動先ファイル取得
3. 両ファイルの競合判定
4. 移動元から削除
5. 移動先へ追加
6. 2ファイルを保存

### 12.3. 完了処理

1. 対象タスク取得
2. `status=done` と `completed_at` 設定
3. 完了プロジェクトへ移動
4. 元ファイルと完了ファイルを保存

### 12.4. プロジェクト削除

1. 対象プロジェクト配下を再帰展開
2. 削除対象タスクファイル一覧を確定
3. 固定プロジェクトでないことを確認
4. 関連タスクファイル削除
5. `project.json` 更新

## 13. 画面設計

### 13.1. 主要画面

- ログイン画面
- インボックス画面
- プロジェクト画面
- 保存ビュー画面
- タスク詳細/編集パネル
- タグ管理UI
- プロジェクト管理UI
- 設定画面

### 13.2. レイアウト

- 左サイドバー
  - インボックス
  - 保存ビュー
  - プロジェクトツリー
  - タグ導線
- 中央ペイン
  - タスク一覧
  - プロジェクト画面では `子プロジェクトを含める` トグルを表示
  - タスク一覧ではプロジェクト名、期限、優先度、タグを表示する
- 右ペインまたはモーダル
  - タスク詳細編集
  - プロジェクト編集
    - 名称変更
    - 親プロジェクト変更ドロップダウン
    - サブプロジェクト作成
  - 保存ビュー編集
    - View 画面では通常はビュー編集を表示し、タスク選択時はタスク編集を優先表示する
  - プロジェクト、タグ、保存ビューの新規作成は追加ボタンからモーダルダイアログで行う

### 13.3. MVP画面要素

- タスク一覧
  - フラット表示を基本とし、完了タスクは折りたたみセクションで表示する
  - `完了` プロジェクトでは完了済みタスクを主一覧として表示する
  - プロジェクト表示は必要箇所のみ `[Project]` 形式のパス表示を使う
- プロジェクト編集
  - 通常の新規プロジェクト作成時の初期カラーは白(`#ffffff`)とする
  - `Project Name`, `Color`, `Parent Project Dropdown`, `Sub Project Name` を持つ
  - 親候補からは自分自身、子孫、`Inbox`, `完了` を除外する
- タスク編集
  - `Title`, `Description`, `Due`, `Priority`, `Project`, `Tag` を編集可能
  - View 画面で `Edit` を押した場合も同じ編集フォームを使う
- タグ選択
  - 選択済みタグの一覧表示と、検索入力付き `Tag Cloud` による追加を行う
  - `Title` / `Description` 入力中の `#` または `＃` をトリガに、インラインのタグ候補選択 UI を開ける

### 13.4. テーマ設計

- UI配色はテーマ変数として管理し、将来的な切り替えに備える。
- 初期実装では複数の候補テーマを保持し、デフォルトは `Mist Blue` とする。
- 将来的には設定画面からテーマを変更できるようにする。
- MVPではテーマ選択UIは持たず、実装上はCSS変数または同等の集中管理を前提とする。

### 13.5. MVPキーボードショートカット

- `q`
  - タスク追加開始
- `e`
  - 選択中タスク編集
- `x`
  - 選択中タスク完了
- `g i`
  - インボックスへ移動
- `g d`
  - 完了プロジェクトへ移動
- `/`
  - 検索フォーカス

## 14. バリデーション設計

### 14.1. タスク

- `title`
  - 必須、1文字以上
- `priority`
  - `0-9` または `null`
- `due_date`
  - ISO 8601 文字列または `null`
- `tag_ids`
  - すべて既存タグIDであること

### 14.2. プロジェクト

- `name`
  - 必須
- `system=true` のプロジェクトは名称変更不可、削除不可
- `parent_id`
  - 循環参照禁止

### 14.3. タグ

- `name`
  - 必須
  - 一意

### 14.4. ビュー

- `name`
  - 必須
- `filters`
  - 許可された条件のみ使用可能
- `sort.field`
  - 新ソート UI では `active_key` と `directions` を検証対象にする
  - 詳細は [sort-ui-design.md](/C:/Users/miri/git/codex/taskit/sort-ui-design.md) を参照

## 15. エラー処理

### 15.1. 代表的なエラー

- 未認証
- Google Drive フォルダ未初期化
- JSON破損
- 対象ID不正
- 固定プロジェクト更新禁止
- 競合
- Google API 失敗

### 15.2. エラー時のUI方針

- 保存失敗時はトーストと再試行導線を表示する。
- 競合時はインラインメッセージで対象種別に応じた説明を表示し、再読み込み導線を出す。
- 競合時は `Reload latest data` 実行で最新値を再取得し、未保存変更が失われる注意文を表示する。
- API や Drive 由来の代表的な失敗は、ユーザー向け日本語メッセージへ変換して表示する。
- JSON破損など回復困難なケースでは設定画面への誘導と問い合わせ情報を表示する。

## 16. セキュリティ設計

- OAuthトークンはサーバ側で安全に保持する。
- クライアントに Drive 書き込み権限を直接持たせない。
- すべてのAPIでセッション確認を行う。
- リクエストボディは Zod で検証する。
- ログにはタスク本文や個人情報を過度に出力しない。

## 17. パフォーマンス設計

- サーバ側で `project.json` `tag.json` `view.json` は短時間キャッシュ可能とする。
- タスク一覧は対象プロジェクトに限定して読み込む。
- 親プロジェクト表示時のみ子孫プロジェクトを展開する。
- 初回表示高速化のため、インボックス画面を最優先で最適化する。
- 一覧のソートとフィルタはサーバ側で行う。

## 18. テスト設計

### 18.1. 単体テスト

- バリデーション
- プロジェクト階層展開
- ビュー条件適用
- 競合判定
- タスク移動
- 完了処理

### 18.2. 結合テスト

- Google Drive リポジトリのファイル操作
- Bootstrap 初期化
- 2ファイル更新処理

### 18.3. E2E

- ログインからインボックス表示
- タスク作成
- タスク編集
- タスク完了
- プロジェクト作成
- 親子プロジェクト作成と `子プロジェクトを含める` 切り替え
- 保存ビュー作成
- View 画面でのタスク編集、完了、削除
- 競合発生時のインラインメッセージ

## 19. MVP実装順

1. Google認証と初期化処理
2. Drive ファイルリポジトリ
3. プロジェクト/タグ/ビュー/タスクの型定義とバリデーション
4. タスク一覧取得API
5. タスクCRUD
6. プロジェクトCRUD
7. タグCRUD
8. ビューCRUD
9. 基本UI
10. キーボードショートカット
11. 競合ダイアログ
12. テスト整備

## 20. 将来拡張

- AIタスク登録支援
- リマインダー通知
- 外部公開API
- APIトークン認証
- 差分マージを伴う競合解決
- 高速検索インデックス
- タスク一覧の操作UIをチェックボックス + アイコンボタン中心の高密度レイアウトへ再設計
- `Reload latest data` など競合回復導線の強調配色見直し
- タグ選択UIを、選択済みタグ表示 + 検索可能コンボボックスの二段構成へ再設計
- タグのプロパティにdescriptionを追加し、UIも修正する。
