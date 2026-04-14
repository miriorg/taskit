# レイアウト横幅仕様メモ

このメモは、現行実装の横方向レイアウト条件を実装ベースで記録するためのもの。対象は `src/app/globals.css` と `src/components/task/task-workspace-client.tsx`。

## 1. Project 色コントロール

### 1.1. 適用箇所

- `Add Project` ダイアログ
- `Edit Project` ダイアログ

どちらも `color-control-row` を使って横並びにしている。

### 1.2. 1 行レイアウトの成立条件

- `.color-control-row` は `display: flex`
- `align-items: center`
- `gap: 12px`
- `flex-wrap: nowrap`

このため、要素は常に改行せず 1 行で並ぶ。

### 1.3. Add Project の構成

- パレットボタン
- 6 桁 HEX 入力

横幅配分:

- パレットボタン: `48px` 固定
- HEX 入力: `flex: 1` で残り幅をすべて使用

式:

- `48px + 12px + 残り幅`

### 1.4. Edit Project の構成

- パレットボタン
- 6 桁 HEX 入力
- `親の色を使う` ボタン

横幅配分:

- パレットボタン: `48px` 固定
- HEX 入力: `flex: 1` で残り幅をすべて使用
- `親の色を使う` ボタン: `flex: 0 0 auto` で文言ぶんの自然幅

式:

- `48px + 12px + 残り幅 + 12px + ボタン自然幅`

### 1.5. `親の色を使う` ボタンの有効条件

- ボタン自体は常に表示する
- `projectDialogParentId` から親 project を解決できたときだけ有効化する
- 親 project 未選択時は `disabled`

## 2. 全体レイアウトの横幅変化条件

### 2.1. ワークスペース本体

初期状態:

- `.workspace` は 2 カラム grid
- `grid-template-columns: 320px minmax(0, 1fr)`

条件 1: `max-width: 1100px`

- サイドバー幅を `320px` から `280px` へ縮小
- メインは引き続き `minmax(0, 1fr)`
- `.workspace__detail` は `grid-column: 1 / -1` で全幅に回す

式:

- 通常: `320px + 残り幅`
- `<= 1100px`: `280px + 残り幅`

条件 2: `max-width: 900px`

- `.workspace` を 1 カラム化
- `grid-template-columns: 1fr`

式:

- `<= 900px`: `全幅 1 カラム`

### 2.2. Settings ページ

- `.settings-panel` は `max-width: 720px`
- 画面が広いときは中央寄せ
- 画面が狭いときは親幅いっぱいまで縮む

式:

- `min(親幅, 720px)`

### 2.3. モーダルダイアログ

- `.modal-backdrop` は左右上下に `24px` の余白を持つ
- `.modal-dialog` は `width: min(100%, 420px)`

つまりダイアログ本体の横幅は:

- 画面が広いとき: `420px`
- 画面が狭いとき: backdrop 内の利用可能幅まで縮小

実質式:

- `min(420px, viewport 幅 - 48px)`

### 2.4. タスク行

- `.task-row` は 3 カラム grid
- `grid-template-columns: auto minmax(0, 1fr) auto`

横幅配分:

- 左: checkbox 列は内容幅
- 中央: タイトル・メタ情報列が残り幅
- 右: アクション列は内容幅

`max-width: 900px` でもこの 3 カラム構成は維持する。横幅条件で列構成は変えず、`task-actions` の寄せ先だけ `flex-start` に変える。

### 2.5. 汎用 2 列フィールド

`.field-row` は補助入力の 2 列レイアウトとして使う。

通常:

- `grid-template-columns: minmax(0, 1fr) 140px`

条件: `max-width: 720px`

- `grid-template-columns: 1fr`

式:

- 通常: `残り幅 + 140px`
- `<= 720px`: `全幅 1 カラム`

### 2.6. インラインタグピッカー

- `.inline-tag-picker` は `width: min(360px, calc(100vw - 24px))`

式:

- 通常: `360px`
- 狭い画面: `viewport 幅 - 24px`

## 3. 現行実装上の整理

- Project 色コントロールにはレスポンシブ用の改行条件を設けていない
- そのため、狭いモーダル幅でも 1 行固定を優先する
- 一方で、ワークスペース本体は `1100px` と `900px` の 2 段階で横幅構成を変える
- 補助入力レイアウトである `.field-row` は `720px` で 1 カラム化する

## 4. 実装参照

- `src/app/globals.css`
- `src/components/task/task-workspace-client.tsx`
