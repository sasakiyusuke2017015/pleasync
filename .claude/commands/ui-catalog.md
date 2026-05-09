# ui-catalog 開発コマンド

ui-catalog は Atomic Design ベースの汎用 UI コンポーネントライブラリ。
各プロジェクトに `packages/ui-catalog/` として clone し、`project/<name>` ブランチで開発する。

## 使い方

```
/ui-catalog [サブコマンド]
```

引数なしで実行すると状態診断 + 推奨アクションを表示。

---

## コマンド一覧

| コマンド | 説明 | 使用ブランチ |
|----------|------|-------------|
| `/ui-catalog` | 状態診断 + 推奨アクション | 全て |
| `/ui-catalog sync` | main ↔ project/* 同期 | 全て |
| `/ui-catalog pr` | PR 作成 | project/* |
| `/ui-catalog clean` | 整合性修正・不要コード削除 | 全て |
| `/ui-catalog optimize` | 依存最適化（atomize） | main |
| `/ui-catalog absorb` | アプリ → ui-catalog 昇格 | project/* |
| `/ui-catalog apply` | ui-catalog → アプリ 適用 | project/* |

---

## `/ui-catalog`（状態診断）

引数なしで実行。現在の状態を診断し、次にすべきアクションを提案する。

**処理フロー:**

1. 現在のブランチを判定
2. Git 同期状況を確認
3. VERSION_REGISTRY 整合性をチェック
4. 推奨アクションを表示

**出力イメージ（project/* ブランチ）:**
```
📊 ui-catalog status (project/1on1)

【Git 同期状況】
┌──────────────────────────────────┬───────┐
│ 項目                             │ 件数  │
├──────────────────────────────────┼───────┤
│ 未 push のコミット（→ remote）    │ 2     │
│ main からの未取り込み（← main）   │ 3     │
└──────────────────────────────────┴───────┘

【整合性】
┌──────────────────────────────────┬───────┐
│ チェック項目                      │ 結果  │
├──────────────────────────────────┼───────┤
│ VERSION_REGISTRY ↔ versions.json │ ✅ OK │
│ バレルエクスポートの漏れ           │ ⚠️ 1  │
└──────────────────────────────────┴───────┘

💡 推奨アクション:
1. /ui-catalog sync で main の最新を取り込む
2. /ui-catalog clean でバレルエクスポートの漏れを修正
```

**出力イメージ（main ブランチ）:**
```
📊 ui-catalog status (main)

【PR 状況】
┌──────┬─────────────────────────────────────┐
│ PR#  │ タイトル                             │
├──────┼─────────────────────────────────────┤
│ #12  │ feat: Button に ghost variant 追加  │
│ #13  │ fix: Modal の z-index 修正          │
└──────┴─────────────────────────────────────┘

【project/* ブランチ】
┌──────────────────┬────────────┬────────────┐
│ ブランチ          │ main に対し │ 状態       │
├──────────────────┼────────────┼────────────┤
│ project/1on1     │ +5 / -0    │ 📤 PR 作成可 │
│ project/calend   │ +0 / -2    │ 📥 sync 必要 │
└──────────────────┴────────────┴────────────┘

💡 推奨アクション:
1. PR #12, #13 をレビュー・マージ
2. /ui-catalog sync で project/calend に配布
```

---

## `/ui-catalog sync`

main と project/* ブランチを同期する。**方向は自動判定。**

### project/* ブランチでの動作

main の最新を取り込む。

**処理フロー:**

1. `git fetch origin main`
2. `git rebase origin/main`
3. コンフリクト発生時:
   - **マージ済み検出**: 同じ変更が main にある → 自動 reset
   - **通常コンフリクト**: 解決方法を案内
4. `git push origin project/<name> --force-with-lease`

**マージ済み検出ロジック:**
```bash
# project/* のコミットが main にスカッシュマージ済みかチェック
# 条件: rebase 失敗 + main の最新コミットが project/* の内容を含む
```

コンフリクト時の選択肢:
```
⚠️ rebase 中にコンフリクトが発生しました

このブランチの変更は既に main にマージ済みですか？
  [1] はい → main にリセット（ブランチを最新 main 状態に更新）
  [2] いいえ → コンフリクトを手動解決
  [3] 中止
```

### main ブランチでの動作

全ての project/* ブランチを main に同期する。

**処理フロー:**

1. 全 project/* ブランチを取得
2. 各ブランチについて:
   - main に対する差分を確認
   - 配布が必要なら rebase + force push
   - マージ済みなら reset --hard main

**出力イメージ:**
```
📊 ui-catalog sync (main → project/*)

┌──────────────────┬────────────┬─────────────────────────────┐
│ ブランチ          │ 差分       │ 処理                        │
├──────────────────┼────────────┼─────────────────────────────┤
│ project/1on1     │ -2 commits │ ✅ rebase + push 完了       │
│ project/calend   │ マージ済み  │ ✅ reset --hard main        │
│ project/ticker   │ 同期済み    │ ⏭️ スキップ                 │
└──────────────────┴────────────┴─────────────────────────────┘
```

---

## `/ui-catalog pr`

project/* ブランチから main への Pull Request を作成する。

**処理フロー:**

1. 現在のブランチを確認（project/* であること）
2. 未コミット変更をチェック → あればコミット方法を選択
3. main との差分を確認
4. PR を作成

**出力イメージ:**
```
📊 ui-catalog pr

ブランチ: project/1on1
差分: 3 commits

【コミット一覧】
  a1b2c3d feat: Button に ghost variant 追加
  b2c3d4e fix: Toast のスタイル修正
  c3d4e5f refactor: RefreshButton を Button 使用に変更

PR を作成しますか？ (y/n)

✅ PR #14 を作成しました
   https://github.com/xxx/ui-catalog/pull/14
```

---

## `/ui-catalog clean`

コードベースをクリーンアップし、整合性を確保する。

**処理フロー:**

1. **整合性チェック**
   - VERSION_REGISTRY に登録されているが実体がないコンポーネント
   - 実体があるが VERSION_REGISTRY に未登録のコンポーネント
   - バレルエクスポート（各レイヤーの index.ts）の漏れ
   - ui-catalog.versions.json との差分
   - data-component 属性の漏れ
   - .stories.tsx / .test.tsx の漏れ
   - 依存方向の違反

2. **未使用コードの検出**
   - 未使用のコンポーネント・型定義・ユーティリティ
   - deprecated な残骸

3. **修正の実行**（ユーザー確認後）

4. **ui-catalog.versions.json の自動生成**
   - VERSION_REGISTRY から生成

**出力イメージ:**
```
📊 ui-catalog clean

【整合性チェック】
┌────────────────────────────────┬────────┬─────────────────────────────┐
│ チェック項目                    │ 結果   │ 詳細                        │
├────────────────────────────────┼────────┼─────────────────────────────┤
│ VERSION_REGISTRY ↔ 実体        │ ⚠️ 1   │ Tooltip: 登録あり、実体なし  │
│ バレルエクスポート              │ ⚠️ 1   │ atoms/Slider が未登録       │
│ versions.json 同期             │ ✅ OK  │                             │
│ data-component 属性            │ ⚠️ 2   │ Badge, Card                 │
│ 依存方向                        │ ✅ OK  │                             │
└────────────────────────────────┴────────┴─────────────────────────────┘

修正を実行しますか？
  [1] 全て修正
  [2] 選択して修正
  [3] キャンセル
```

---

## `/ui-catalog optimize`

organisms/templates の依存関係を最適化する。**main ブランチ専用。**

**検出対象:**
- 外部ライブラリ（Mantine, Radix 等）の直接インポート → atoms/molecules に置換
- プリミティブ HTML（`<button>`, `<select>` 等）の直接使用 → atoms に置換
- 同一機能の重複コンポーネント → variant/size で統合

**処理フロー:**

1. 依存関係をスキャン
2. 置換候補を一覧表示
3. 対応方針を選択（置換/新規作成/スキップ）
4. 置換を実行
5. VERSION_REGISTRY を更新

**出力イメージ:**
```
📊 ui-catalog optimize

【プリミティブ HTML】優先度: 中
┌────────────────────┬─────────────────────┬──────────────────────┐
│ ファイル            │ 検出内容             │ 置換候補              │
├────────────────────┼─────────────────────┼──────────────────────┤
│ RefreshButton.tsx  │ <button>            │ → atoms/Button       │
│ Toast.tsx          │ <button>            │ → atoms/Button       │
│ DropdownMenu.tsx   │ <button>            │ → atoms/Button       │
└────────────────────┴─────────────────────┴──────────────────────┘

【variant 統合候補】優先度: 低
┌─────────────────┬─────────────────┬──────────────────────┐
│ コンポーネント A  │ コンポーネント B  │ 統合案               │
├─────────────────┼─────────────────┼──────────────────────┤
│ ResetButton     │ ReplayButton    │ → Button variant     │
│ BackButton      │                 │ → Button variant     │
└─────────────────┴─────────────────┴──────────────────────┘

対応を選択:
  [1] プリミティブ HTML を全て置換
  [2] 選択して置換
  [3] スキップ
```

---

## `/ui-catalog absorb`

アプリ内のコンポーネントを ui-catalog に昇格させる。**project/* ブランチ専用。**

**処理フロー:**

1. 対象コンポーネントを特定（ユーザー指定 or 候補提案）
2. ビジネスロジックを分離（API呼び出し、認証等を props 化）
3. 既存コンポーネントとの統合・分割を判断
4. 適切なレイヤーに配置（atoms/molecules/organisms/templates）
5. バレルエクスポートに追加
6. VERSION_REGISTRY に登録
7. アプリ側のインポートを書き換え

**出力イメージ:**
```
📊 ui-catalog absorb

対象: src/components/UserProfileCard.tsx

【分析結果】
- ビジネスロジック: API呼び出し 2箇所、認証チェック 1箇所
- 類似コンポーネント: MemberCard (類似度: 65%)
- 推奨レイヤー: organisms

【提案】
  [1] 新規コンポーネントとして昇格（UserProfileCard → organisms/ProfileCard）
  [2] MemberCard の variant として統合
  [3] キャンセル

選択: 1

✅ absorb 完了
  - organisms/ProfileCard を作成
  - VERSION_REGISTRY に ProfileCard: '1.0.0' を登録
  - src/components/UserProfileCard.tsx → @ui-catalog/core/organisms から import
```

---

## `/ui-catalog apply`

ui-catalog コンポーネントをアプリに適用する。**project/* ブランチ専用。**

**処理フロー:**

1. ui-catalog の全コンポーネントをリスト化
2. アプリ側で未活用のコンポーネントを検出
3. 置き換え対象を選択
4. 置き換えを実行
5. 不要になったローカルコンポーネントを削除

**出力イメージ:**
```
📊 ui-catalog apply

【未活用コンポーネント】
┌────────────────────┬───────────────────────────────────────────┐
│ ui-catalog         │ アプリ側で発見                             │
├────────────────────┼───────────────────────────────────────────┤
│ Button (atoms)     │ src/components/CustomButton.tsx で独自実装 │
│                    │ className="btn btn-primary" 12箇所         │
│ Modal (molecules)  │ src/ui/Dialog.tsx が同等機能              │
└────────────────────┴───────────────────────────────────────────┘

置き換えを実行しますか？
  [1] 全て置き換え
  [2] 選択して置き換え
  [3] キャンセル
```

---

## 共通ルール

### バージョン更新ルール

コンポーネント変更時は必ず同じコミット内で VERSION_REGISTRY と
ui-catalog.versions.json を更新する。

| 変更の種類 | バージョン |
|-----------|-----------|
| UI に変更なし（内部リファクタ等） | **patch** |
| UI に変更あり（props 追加、見た目変更等） | **minor** |
| 破壊的変更（props 削除/改名、API 変更） | **major** |

### 依存方向

```
atoms ← molecules ← organisms ← templates
```

逆方向の依存は禁止。

### Git ワークフロー

```
project/* ブランチで開発
    ↓
/ui-catalog pr で PR 作成
    ↓
レビュー → Squash Merge
    ↓
/ui-catalog sync で project/* を main に同期
```

**重要**: Squash Merge 後、project/* ブランチは自動で main にリセットされる（sync 時）。
