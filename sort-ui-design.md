# タスク一覧ソート UI 設計

## 1. 背景

- 仕様書では、タスク一覧上部に `Project Order / Subject Order / Due Order / Priority Order` の4ボタンを配置する前提になっている。
- 現行実装の `View.sort` は `field + direction` の単一状態であり、4ボタン UI の状態を十分に表現できない。
- 特に `Project Order` は単なる比較キーではなく、`Project ごとのグルーピング表示` まで含むため、既存の単一ソート設計では責務が不足している。

## 2. 設計目標

- 4つのソートボタンの UI 状態を一貫して扱えること。
- 保存ビューにソート状態をそのまま保存・復元できること。
- `Project Order` だけ表示モードが変わる点を状態として明示すること。
- ソートキー切替時の挙動を deterministic にすること。
- 将来の二次ソート追加やボタン追加に拡張しやすいこと。

## 3. 状態モデル

### 3.1. 用語

- `Sort Key`
  - `project`
  - `subject`
  - `due`
  - `priority`
- `Sort Direction`
  - `asc`
  - `desc`

### 3.2. 提案型

```ts
type TaskListSortKey = "project" | "subject" | "due" | "priority";
type SortDirection = "asc" | "desc";

type TaskListSortState = {
  active_key: TaskListSortKey;
  directions: Record<TaskListSortKey, SortDirection>;
};
```

### 3.3. この形を採用する理由

- `active_key` で「現在どのボタンが有効か」を明示できる。
- `directions` で各ボタンの直近方向を保持できる。
- ただし UI 仕様では、非アクティブボタン押下時は常に昇順開始なので、保存時は `directions` を保持していても、非アクティブ押下時には `asc` へリセットする。
- 将来、非アクティブ復帰時に「前回方向を維持する」仕様へ変える場合でも、データ構造を変えずに済む。

## 4. UI 状態遷移

### 4.1. 初期状態

- デフォルトは `Due Order` の昇順。

```ts
const defaultTaskListSortState: TaskListSortState = {
  active_key: "due",
  directions: {
    project: "asc",
    subject: "asc",
    due: "asc",
    priority: "asc",
  },
};
```

### 4.2. ボタンクリック時の遷移

#### アクティブボタンを押した場合

- 対象キーの `direction` をトグルする。
- `active_key` は変えない。

```ts
function toggleActiveSort(state: TaskListSortState): TaskListSortState
```

#### 非アクティブボタンを押した場合

- 押したキーを `active_key` にする。
- 対象キーの `direction` は `asc` にリセットする。
- 他キーの `direction` は保持する。

```ts
function activateSort(state: TaskListSortState, key: TaskListSortKey): TaskListSortState
```

### 4.3. 表示ルール

- アクティブボタン
  - アクティブ色
  - `▲` または `▼` を単独表示
- 非アクティブボタン
  - インアクティブ色
  - 中立状態として `▲▼` を表示

このため、非アクティブボタンの見た目は `directions` に依存させず、見た目用状態と内部状態を分離する。

## 5. 保存ビューとの整合

### 5.1. `View.sort` の再設計

現行:

```ts
type ViewSort = {
  field: "due_date" | "created_at" | "updated_at" | "priority" | "title";
  direction: "asc" | "desc";
};
```

提案:

```ts
type ViewSort = TaskListSortState;
```

### 5.2. 保存対象

- 保存ビューでは `active_key` と `directions` を保存する。
- これにより、ビュー再表示時に UI 上のアクティブボタンと方向を復元できる。

### 5.3. 互換移行

既存データとの互換のため、読み込み時に旧形式を新形式へ変換する migration を `ViewRepository` または `ViewService` で行う。

```ts
function migrateLegacyViewSort(sort: LegacyViewSort | TaskListSortState): TaskListSortState
```

変換ルール:

- `title` -> `subject`
- `due_date` -> `due`
- `priority` -> `priority`
- `created_at` / `updated_at`
  - MVP の4ボタン仕様では直接対応しないため `due` にフォールバックする
- `field === "project"` は旧形式に存在しないため考慮不要

フォールバック時の扱い:

- `active_key = mappedKey`
- `directions[mappedKey] = legacy.direction`
- 他キーは `asc`

## 6. 並び替え規則

### 6.1. 共通方針

- すべてのソートは安定ソート前提で扱う。
- 主キーが同値のときは、二次・三次キーで表示順を安定化する。
- `null` 値の扱いをキーごとに固定する。

### 6.2. 比較用の正規化値

- `project`
  - 仕様書の `[Project]` 表示ルールに沿ったフルパス文字列
- `subject`
  - `task.title` を case-insensitive に正規化した文字列
- `due`
  - `task.due_date`
- `priority`
  - `task.priority`

### 6.3. `null` の扱い

- `due`
  - `asc` では末尾
  - `desc` でも末尾
  - 理由: 期限未設定は「順序不明」とみなし、期限ありタスクの後ろに寄せる
- `priority`
  - `asc` でも `desc` でも末尾
  - 理由: 優先度未設定は明示優先度より後ろに寄せる

### 6.4. 比較チェーン

#### `project`

1. project path
2. subject
3. due
4. priority
5. created_at

#### `subject`

1. subject
2. due
3. priority
4. project path
5. created_at

#### `due`

1. due
2. priority
3. subject
4. project path
5. created_at

#### `priority`

1. priority
2. due
3. subject
4. project path
5. created_at

## 7. `Project Order` の表示モード

### 7.1. 表示切替

- `active_key !== "project"`
  - フラットなタスクリスト
  - 各行に `Project` ラベルを表示
- `active_key === "project"`
  - `project` 単位でグルーピング表示
  - グループヘッダに開閉 UI を表示
  - 各行では `Project` ラベルを省略可能

### 7.2. グループ開閉状態

`Project Order` の開閉状態は保存ビューの永続状態には含めない。ページローカル UI 状態として扱う。

```ts
type ProjectGroupCollapseState = Record<string, boolean>;
```

理由:

- 一時的な閲覧状態であり、ビュー定義そのものではない。
- タスク件数変化でプロジェクト集合が変わるため、永続化メリットが低い。

## 8. 責務分担

### 8.1. サーバ

- 保存ビューのソート状態を検証する
- ビュー問い合わせ時にソート済み結果を返す
- `project path` の解決に必要な project master を参照する

### 8.2. クライアント

- 4ボタンの見た目とクリック遷移を管理する
- `Project Order` のグループ開閉を管理する
- ビュー保存時に `TaskListSortState` を送信する

## 9. 実装対象

### 9.1. 型

- `src/types/domain.ts`
- `src/types/input.ts`
- `src/types/api.ts` は必要に応じて DTO 補強

### 9.2. バリデーション

- `src/lib/validators/domain.ts`
- `src/lib/validators/input.ts`

### 9.3. サービス

- `src/lib/services/view-service.ts`
  - 新ソート状態の解釈
  - 旧データ migration
- `src/lib/services/task-service.ts`
  - `project path` 解決ヘルパーを追加する場合の受け皿

### 9.4. クライアント

- `src/components/task/task-workspace-client.tsx`
  - view draft の sort 型差し替え
  - ソートボタン UI 追加
  - `Project Order` グルーピング描画追加

## 10. テスト観点

- 初期表示は `Due Order asc` になること
- アクティブボタン再クリックで `asc/desc` が切り替わること
- 非アクティブボタン押下で `asc` から開始すること
- `Project Order` で project グルーピングされること
- `Project Order` 解除でフラット表示へ戻ること
- `due = null` / `priority = null` が末尾固定になること
- 旧 `View.sort` データを読み込めること
- 保存ビュー再表示時にアクティブキーと方向が復元されること

## 11. 実装順

1. 型と Zod スキーマを新 `TaskListSortState` に変更する
2. 旧 `View.sort` からの migration を `ViewService` に追加する
3. ソート比較ロジックを `active_key` ベースへ置き換える
4. タスク一覧ヘッダに4ボタン UI を実装する
5. `Project Order` グルーピング表示を実装する
6. 単体テストを追加する
