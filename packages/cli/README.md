# pleasync (CLI)

Pleasync の CLI ツール。`generate` を提供する（`plan`/`apply`/`introspect` は Phase 3+）。

## ステータス

✅ **Phase 2 (`generate`) 完了** — schema → typed client コード生成 (17 tests passing)

## インストール（将来 npm 公開後）

```bash
npm install -D pleasync @pleasync/orm
npx pleasync generate
```

## コマンド

### `pleasync generate`

`pleasync.schema.yaml` から型付きクライアント TS コードを生成。

```bash
pleasync generate                                    # ./pleasync.schema.yaml → ./pleasync-generated/index.ts
pleasync generate --schema ./db/schema.yaml          # 別 schema パス
pleasync generate --out ./src/generated              # 別出力先
pleasync generate --stdout                           # 標準出力に書く（ファイル書かない）
```

### 使い方の流れ

1. `pleasync.schema.yaml` を書く

```yaml
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    siteId: 35535       # 既存サイトを指定（未指定時は警告コメント付きで生成）
    title: 顧客マスタ
    fields:
      code:   { slot: ClassA, label: 顧客コード, type: text, required: true }
      name:   { slot: ClassB, label: 名前, type: text, required: true }
      status:
        slot: Status
        label: 状況
        type: status
        choices:
          - { value: 100, label: アクティブ }
          - { value: 900, label: 休止 }
```

2. 生成

```bash
npx pleasync generate
# → pleasync-generated/index.ts が出力
```

3. アプリ側で利用

```typescript
import { PleasyncClient } from './pleasync-generated/index.js'

const client = await PleasyncClient.fromConfig({
  baseUrl: process.env.PLEASANTER_BASE_URL!,
  apiKey: process.env.PLEASANTER_API_KEY!,
})

// 型安全な CRUD
const customer = await client.customer.create({
  data: {
    code: 'C-001',
    name: 'サンプル株式会社',
    status: 100,                        // ← '100 | 900' の literal union で補完
  },
})

const list = await client.customer.findMany({
  where: { status: 100 },               // ← 型でガード
})
```

## 生成されるコードの形

| 1 model につき | 内容 |
|---|---|
| `<Pascal>Record` | 読み取り型。`id: number` + 全 field + `createdAt`/`updatedAt` |
| `<Pascal>CreateInput` | 作成入力。`required: true` の field のみ必須 |
| `<Pascal>UpdateInput` | 更新入力。全 field optional |
| `<Pascal>Where` | findMany の where 句 |
| `<Pascal>Collection` | `ModelCollection` のサブクラス。CRUD メソッド |

トップレベル: `PleasyncClient` クラスに各 model の collection が `readonly` で生える。

### `pleasync introspect`

既存 Pleasanter サイトから schema YAML を逆生成（Phase 4）。

**経路 1: API 経由（個別 siteId 指定）**

```bash
# 1 site → stdout
pleasync introspect 35535

# 複数 site → ファイル書き出し
pleasync introspect 35535 35536 --out pleasync.schema.yaml

# 接続情報を引数で渡す（環境変数も可）
pleasync introspect 35535 \
  --base-url http://192.168.10.64 \
  --api-key abc... \
  --api-version 1.1
```

**経路 2: SitePackage JSON 一括取り込み（Phase 4 拡張）**

Pleasanter UI の「サイトパッケージのエクスポート」で取得した JSON を渡せば、親サイト + 配下の全サイトを一気に schema 化できる。

```bash
# 親フォルダ + 配下全部を取り込む
pleasync introspect --package ./pleasanter-export.json --out schema.yaml

# Sites 型 (フォルダ) も schema に含める（デフォルトは除外）
pleasync introspect --package ./pleasanter-export.json --include-folders
```

API 接続不要。ローカルファイルから完結する。

**マッピング**:

| Pleasanter ColumnName | logical type | 備考 |
|---|---|---|
| `Title` / `Body` / `Manager` / `Owner` | `text` | |
| `Class*` | `class` (with choices) または `text` | ChoicesText の有無で分岐 |
| `Num*` | `number` | |
| `Date*` / `StartTime` / `CompletionTime` | `datetime` | |
| `Description*` | `description` | |
| `Check*` | `check` | |
| `Status` | `status` | ChoicesText を choices にパース |
| `IssueId` / `ResultId` / `Comments` / `Creator` / `Updator` / `Ver` 等 | (skip) | id は schema で抽象化、システム列は管理しない |

**制約**:
- `relation` は推定できないため出力しない（手動編集してください）
- 日本語タイトルは識別子に変換できないため `site<id>` にフォールバック

### `pleasync plan`

schema と Pleasanter 現状の差分を表示する **read-only** コマンド（Phase 3.1）。

```bash
pleasync plan
pleasync plan --schema ./db/schema.yaml --base-url ... --api-key ...
```

各 model について:
- siteId 未指定 / 該当 site 不在 → `+ create`
- title または column の label/choices に差分 → `~ update`
- 完全一致 → `= unchanged`

schema にない site 側の column は `(orphan)` として情報のみ表示（apply でも触らない）。
システムカラム (`CreatedTime`, `Comments` 等) は orphan 扱いから除外。

出力例:

```
+ invoice — create new site
    type: Results
    parentId: 35534
    title: 請求書
    fields: 3
~ customer (siteId=35535) — update
    title: "顧客マスタ" → "顧客マスタ v2"
    + column ClassC (text) "メモ"
    ~ column ClassA label: "コード" → "顧客コード"
= order (siteId=35540) — no changes

Plan: 1 to create, 1 to update, 1 unchanged.
```

### `pleasync apply`

`plan` で計算した差分を実際に Pleasanter に反映する（Phase 3.2）。

```bash
pleasync apply
pleasync apply --schema ./schema.yaml --base-url ... --api-key ...
pleasync apply --skip-schema-writeback        # siteId 自動書き戻しを抑止
```

**操作**:
- `create`: `createSite(parentId, ...)` → 続けて `updateSite(newId, { Columns })` で fields 反映
- `update`: 既存 columns + schema 差分を merge → `updateSite(siteId, { Title?, SiteSettings.Columns })`
- `unchanged`: skip

**schema write-back**:
- create された model の siteId は schema YAML に自動で書き戻される
- yaml ライブラリの Document API でコメント・順序を保ったまま `siteId: <newId>` だけを追記

**安全設計**:
- 削除系の操作はサポート外（site delete / column delete）
- schema にない既存 column (orphan) は触らない（既存データ保護）
- merge 戦略: 既存 columns に schema 側の差分を上書き、共通 slot は LabelText/ChoicesText のみ更新

**MVP の制約**:
- 確認プロンプトは無い（`plan` で事前確認する設計）
- partial 失敗時のロールバックは無い（Pleasanter にトランザクション無いため）
- 一部だけ apply はできない（全 model 一括）

## 後続フェーズ

- **Phase 3.3+**: `--allow-destroy` 付きの site/column 削除サポート
- **Phase 2.6**: relation の `include`、where の operator 拡充

## テスト

```bash
pnpm --filter pleasync test
```

74 tests passing。

| ファイル | テスト数 |
|---|---|
| `generate.test.ts` | 14 |
| `command-generate.test.ts` | 6 |
| `introspect.test.ts` | 21 |
| `command-introspect.test.ts` | 9 |
| `diff.test.ts` | 12 |
| `command-plan.test.ts` | 6 |
| `command-apply.test.ts` | 8 |
| `site-package.test.ts` | 9 |

## ライセンス

MIT
