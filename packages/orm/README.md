# @pleasync/orm

Pleasanter 用の型付き ORM ランタイム（Prisma 風）。

## 役割

`pleasync` CLI の `generate` コマンドが schema から生成した TypeScript コードが、ランタイムでこのパッケージに依存する。HTTP 通信は内部で `@pleasync/client` (napi-rs ネイティブ) に委譲する。

## ステータス

✅ **Phase 2 完了** — Engine + ModelCollection + transform (37 tests passing)

## 公開 API

```typescript
import { Engine, ModelCollection } from '@pleasync/orm'
import type { ModelDef, PleasanterApi, EngineConfig } from '@pleasync/orm'
```

### `Engine`

Pleasanter API クライアントの薄いラッパー。

```typescript
// 通常: 接続設定から作る（@pleasync/client を内部で require）
const engine = await Engine.fromConfig({ baseUrl, apiKey, apiVersion: '1.1' })

// テスト: 任意の PleasanterApi 実装を注入
const engine = Engine.fromApi(mockApi)
```

### `ModelCollection<TRecord, TCreate, TUpdate, TWhere>`

1 model 用の CRUD 基底クラス。codegen がサブクラスを生成して `modelDef` を埋め込む。

提供メソッド:

- `findUnique({ where: { id } })` → `TRecord | null`
- `findMany({ where?, take?, skip? })` → `TRecord[]`
- `create({ data })` → `TRecord`
- `update({ where: { id }, data })` → `void`
- `delete({ where: { id } })` → `void`

### `transform` ユーティリティ

logical name ↔ Pleasanter wire format の変換:

- `toApiPayload(data, modelDef)` — `{ code: 'C-001' }` → `{ ClassHash: { ClassA: 'C-001' } }`
- `fromApiRecord(raw, modelDef)` — `{ ResultId: 1, ClassHash: { ClassA: 'A' } }` → `{ id: 1, code: 'A' }`

slot prefix → Pleasanter Hash の対応:

| slot prefix | Hash | 例 |
|---|---|---|
| `Class*` | `ClassHash` | `ClassA` → text/class/relation |
| `Num*` | `NumHash` | `NumA` → number |
| `Date*` | `DateHash` | `DateA` → datetime |
| `Check*` | `CheckHash` | `CheckA` → boolean |
| `Description*` | `DescriptionHash` | `DescriptionA` → long text |
| 直接カラム | (hash 無し) | `Status`, `Title`, `Body`, `StartTime`, etc. |

## id 抽象化

Pleasanter は ReferenceType ごとに id slot が違う:
- Issues → `IssueId`
- Results → `ResultId`
- Wikis → `WikiId`
- Sites → `SiteId`

`fromApiRecord` はこれを **常に `id: number`** として正規化する。アプリ側コードは `record.id` で統一して書ける（Prisma スタイル）。

## テスト

```bash
pnpm --filter @pleasync/orm test
```

37 tests passing (transform 24 + ModelCollection 13)。

## ライセンス

MIT
