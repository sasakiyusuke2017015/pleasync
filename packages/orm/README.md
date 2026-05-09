# @pleasync/orm

Pleasanter 用の型付き ORM ランタイム（Prisma 風）。

## 役割

`pleasync` CLI が schema から生成した TypeScript コードが、ランタイムでこのパッケージに依存する。実際の HTTP 通信は内部で `@pleasync/client` に委譲する。

## ステータス

📋 **Phase 2（未実装）**

## 利用イメージ

`pleasync.schema.yaml` を書く:

```yaml
models:
  customer:
    type: Results
    parentId: 35534
    fields:
      code:  { slot: ClassA, label: 顧客コード, type: text, unique: true }
      name:  { slot: ClassB, label: 名前, type: text }
      email: { slot: ClassE, label: メールアドレス, type: text }
```

`pleasync generate` で型付きクライアント生成 → アプリ側:

```typescript
import { pleasync } from './pleasync-generated'

const client = pleasync({ baseUrl, apiKey, apiVersion: '1.1' })

const customer = await client.customer.create({
  data: {
    code: 'C-001',
    name: 'サンプル株式会社',
    email: 'a@b.c',
  },
})

const list = await client.customer.findMany({
  where: { code: { startsWith: 'C-' } },
})
```
