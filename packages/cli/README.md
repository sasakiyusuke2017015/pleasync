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

## 後続フェーズ

- **Phase 3**: `pleasync plan` / `pleasync apply` （schema を Pleasanter に反映）
- **Phase 4**: `pleasync introspect <siteId>` （既存 Pleasanter から schema 逆生成）

## テスト

```bash
pnpm --filter pleasync test
```

17 tests passing (codegen 11 + command-generate 6)。

## ライセンス

MIT
