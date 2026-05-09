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

### `pleasync introspect <siteId>...`

既存 Pleasanter サイトから schema YAML を逆生成（Phase 4）。

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

## 後続フェーズ

- **Phase 3.2**: `pleasync apply` — plan の結果を実際に Pleasanter へ反映
  - `--allow-destroy` 必須の操作はまだ無し（site/column delete は対象外）

## テスト

```bash
pnpm --filter pleasync test
```

66 tests passing。

| ファイル | テスト数 |
|---|---|
| `generate.test.ts` | 14 |
| `command-generate.test.ts` | 6 |
| `introspect.test.ts` | 21 |
| `command-introspect.test.ts` | 7 |
| `diff.test.ts` | 12 |
| `command-plan.test.ts` | 6 |

## ライセンス

MIT
