# ORM API リファレンス

`pleasync generate` で生成された `PleasyncClient` の API。実体は `@pleasync/orm` の `ModelCollection<...>` 上に乗る。

## クライアントの構築

```typescript
import { PleasyncClient } from './pleasync-generated';

// 通常: @pleasync/client を内部 require
const client = await PleasyncClient.fromConfig({
  baseUrl: 'https://pleasanter.example.com',
  apiKey:  'xxx',
  apiVersion: '1.1',
});

// テスト: Engine を直接渡す（@pleasync/client を mock 可能）
import { Engine } from '@pleasync/orm';
const engine = Engine.fromApi(mockApi);
const client = PleasyncClient.fromEngine(engine);
```

## メソッド一覧（各 model collection）

| メソッド | 戻り値 |
|---|---|
| `findUnique({ where, include? })` | `TRecord \| null` |
| `findMany({ where?, orderBy?, include?, take?, skip? })` | `TRecord[]` |
| `create({ data })` | `TRecord` |
| `update({ where, data })` | `void` |
| `delete({ where })` | `void` |

## `findUnique`

ID で 1 件取得。見つからなければ `null`。

```typescript
const customer = await client.customer.findUnique({
  where: { id: 12345 },
});

if (customer === null) {
  // 404 / 削除済
}
```

### include で関連 record を populate

```typescript
const invoice = await client.invoice.findUnique({
  where: { id: 1 },
  include: { customerId: true },
});
// invoice.customerId は CustomerRecord (FK ではなく populated record)
```

## `findMany`

複数件取得。引数なしで全件、`where`/`orderBy`/`take`/`skip` で絞り込み・整列・ページング。

```typescript
// 全件
const all = await client.customer.findMany();

// 条件 + 整列 + ページング
const list = await client.customer.findMany({
  where: { status: 100 },
  orderBy: { code: 'asc' },
  take: 20,
  skip: 0,
});

// include で関連を populate
const invoices = await client.invoice.findMany({
  where: { customerId: 1 },
  include: { customerId: true },
});
```

## `where` 演算子

各 field はリテラル値（equals 略記）または `WhereOperator<T>` を受け付ける。

### Server-side（Pleasanter ColumnFilterHash）

| 演算子 | 例 | 挙動 |
|---|---|---|
| リテラル | `{ status: 100 }` | equals 略記 |
| `equals` | `{ status: { equals: 100 } }` | 単一値一致 |
| `in` | `{ status: { in: [100, 200] } }` | 配列いずれかと一致 |

### Client-side（fetch 後 JS フィルタ）

| 演算子 | 例 | 用途 |
|---|---|---|
| `not` | `{ status: { not: 900 } }` | 否定 |
| `notIn` | `{ status: { notIn: [100, 200] } }` | 配列にない |
| `contains` | `{ code: { contains: 'C-' } }` | 部分文字列 |
| `startsWith` | `{ code: { startsWith: 'foo' } }` | 前方一致 |
| `endsWith` | `{ code: { endsWith: 'foo' } }` | 後方一致 |
| `gt` | `{ amount: { gt: 1000 } }` | 大なり |
| `gte` | `{ amount: { gte: 100 } }` | 以上 |
| `lt` | `{ amount: { lt: 100 } }` | 小なり |
| `lte` | `{ amount: { lte: 100 } }` | 以下 |

### 複数条件（AND）

```typescript
await client.customer.findMany({
  where: {
    status: 100,                  // server-side equals
    code: { contains: 'C-' },     // client-side
  },
});
```

server-side ops は `ColumnFilterHash` に集約、client-side ops は fetch 後の JS で適用。

### 注意

- client-side op が混じると **`take`/`skip` は client 側で再適用**（server には送らない）。巨大データセットで遅くなる可能性
- 型不一致比較（例: number vs string）は false 扱い
- Date 比較は `getTime()` ベース、ISO 文字列も自動 parse

## `orderBy`

```typescript
await client.customer.findMany({
  orderBy: { code: 'asc', status: 'desc' },
});
```

`ColumnSorterHash` にマップされる。

## `include` (relation)

```typescript
await client.invoice.findUnique({
  where: { id: 1 },
  include: { customerId: true },   // FK が CustomerRecord に置換
});
```

### 制約

- forward relation のみ（FK を持つ側からの include）
- inverse relation (1:N) は未対応
- N+1 fetch（同一 id は内部 cache で 1 回のみ）
- nested include (`include: { customer: { include: { ... } } }`) は未対応

## `create`

```typescript
const customer = await client.customer.create({
  data: {
    code: 'C-001',
    name: 'サンプル',
    status: 100,
  },
});
// customer.id (新規 ResultId), 完全な CustomerRecord
```

`required: true` の field は必須。`default` 指定の field は optional。

## `update`

```typescript
await client.customer.update({
  where: { id: 1 },
  data: { status: 900 },          // 部分更新
});
// 戻り値は void。再取得したいなら別途 findUnique
```

## `delete`

```typescript
await client.customer.delete({ where: { id: 1 } });
```

## id の抽象化

Pleasanter は ReferenceType ごとに id slot が違うが、生成クライアントは **常に `id: number`** で統一:

| ReferenceType | Pleasanter slot | 生成型 |
|---|---|---|
| `Issues` | `IssueId` | `id: number` |
| `Results` | `ResultId` | `id: number` |
| `Wikis` | `WikiId` | `id: number` |
| `Sites` | `SiteId` | `id: number` |

アプリ側コードは `record.id` で書ける（Prisma スタイル）。

## 詳細

- `@pleasync/orm` 本体: [packages/orm/README.md](../packages/orm/README.md)
- `pleasync generate` の出力構造: [cli.md](./cli.md)
