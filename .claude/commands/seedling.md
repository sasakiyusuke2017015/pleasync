# seedling-ui 開発コマンド

seedling-ui は Atomic Design ベースの UI コンポーネントライブラリ。
詳細は `packages/seedling-ui/DEVELOPMENT.md` を参照。

## 使い方

```
/seedling <サブコマンド>
```

サブコマンド: `absorb`, `develop`, `refine`, `status`, `full`

---

## サブコマンド

### `absorb [source-name]` — 吸収

外部からコンポーネントを seedling-ui に取り込む。

**取り込み元:**
- `apps/web/src/components/` 内のコンポーネント（内部昇格）
- 外部ライブラリ（shadcn/ui、Radix UI など）
- 別プロジェクトの seedling-ui（source-name を指定）

**処理フロー:**
1. 対象コンポーネントを分析
2. 既存コンポーネントとの重複・差分を確認
3. 依存関係を整理（atoms → molecules → organisms の方向を守る）
4. 適切なディレクトリに配置
5. バレルエクスポート（index.ts）に追加
6. VERSION_REGISTRY に `'1.0.0'` で登録
7. `seedling-ui.versions.json` にも追加

**別 seedling-ui から吸収（source-name 指定時）:**

ソース配置場所: `packages/.seedling-sources/<source-name>/seedling-ui/`

```
1on1/
└── packages/
    ├── seedling-ui/              ← Main（現在のプロジェクト）
    └── .seedling-sources/        ← gitignore 推奨
        └── other-project/        ← source-name
            └── seedling-ui/      ← Sub の seedling-ui
```

使い方:
```bash
/seedling absorb other-project
```

1. `packages/.seedling-sources/<source-name>/seedling-ui/version.ts` を読み込み
2. Main と Sub の VERSION_REGISTRY を比較
3. 差分レポートを出力:
   - ⬆️ **更新候補**: Sub の方がバージョンが高い
   - ➕ **新規候補**: Sub にのみ存在
   - ✅ **同期済み**: 同じバージョン
   - ⏭️ **Main のみ**: Main にのみ存在（スキップ）
4. ユーザーが取り込むコンポーネントを選択
5. 選択されたコンポーネントを Main にコピー
6. VERSION_REGISTRY と versions.json を更新
7. バレルエクスポートを更新
8. `tsc --noEmit` で検証

出力イメージ:
```
📊 seedling-ui absorb 差分レポート

Source: other-project

┌─────────────────┬──────────┬──────────┬────────────┐
│ コンポーネント   │ Main     │ Sub      │ アクション  │
├─────────────────┼──────────┼──────────┼────────────┤
│ Button          │ 1.0.0    │ 1.2.0    │ ⬆️ 更新候補 │
│ Dialog          │ 1.0.0    │ 1.1.0    │ ⬆️ 更新候補 │
│ Drawer          │ -        │ 1.0.0    │ ➕ 新規候補 │
│ Card            │ 1.0.0    │ 1.0.0    │ ✅ 同期済み │
│ Tabs            │ 1.0.0    │ -        │ ⏭️ Main のみ │
└─────────────────┴──────────┴──────────┴────────────┘
```

### `develop` — 発展

コンポーネントの作成・拡張・修正を行う。

**対象:**
- 新規コンポーネントの作成
- 既存コンポーネントへの機能追加
- バグ修正・改善

**処理フロー:**
1. 配置先を決定（atoms の組み合わせ → molecules、複雑 → organisms）
2. コンポーネントを作成/変更（`data-component` 属性を付与）
3. バレルエクスポートに追加（新規の場合）
4. VERSION_REGISTRY を更新（新規: `'1.0.0'`、変更: バージョンアップ）
5. `seedling-ui.versions.json` も同じバージョンに更新

### `refine` — 洗練

コードベースをクリーンアップし、整合性を確保する。

**対象:**
- 未使用コード・コンポーネント・型定義
- 後方互換の残骸（deprecated、不要な再エクスポート）
- VERSION_REGISTRY と versions.json の不整合
- バレルエクスポートの漏れ

**処理フロー:**
1. 未使用コード・後方互換の残骸を検索
2. VERSION_REGISTRY / versions.json / バレルエクスポートの整合性を確認
3. 使用状況を確認し、削除可能か判断
4. 不要なコードを削除
5. `tsc --noEmit` で検証

### `status` — 状態確認

現在の seedling-ui の状態を診断する。

1. VERSION_REGISTRY と `seedling-ui.versions.json` の差分を確認
2. バレルエクスポート（index.ts）に未登録のコンポーネントがないか確認
3. VERSION_REGISTRY に未登録のコンポーネントがないか確認
4. `tsc --noEmit` で型エラーを確認
5. 結果を報告

### `full` — 全フェーズ一連実行

seedling-ui のメンテナンスを全フェーズ順番に実行する。

1. **absorb** — 不足コンポーネントの復元・取り込み
2. **develop** — 必要なコンポーネントの作成・拡張
3. **refine** — バレルエクスポート・VERSION_REGISTRY・versions.json の整合性確認
4. `tsc --noEmit` で型チェック
5. 変更サマリーを報告

> 各ステップ完了後、次に進む前にユーザーに確認を取る。

---

## バージョン更新ルール

コンポーネント変更時は必ず同じコミット内で VERSION_REGISTRY と versions.json を更新する。

| 変更の種類 | バージョン |
|-----------|-----------|
| UI に変更なし（内部リファクタ等） | **patch** |
| UI に変更あり（props 追加、見た目変更等） | **minor** |
| 破壊的変更（props 削除/改名、API 変更） | **major** |

## インポート規則

```typescript
// サブパスインポート（推奨）
import { Button } from '@seedling/ui/atoms'
import { Dialog } from '@seedling/ui/molecules'
import { InteractiveTable } from '@seedling/ui/organisms'
```

## 依存方向

```
atoms ← molecules ← organisms ← templates
```

逆方向の依存は禁止。
