# @pleasync/schema

Pleasanter スキーマ DSL のパーサー・AST・validator。

## 役割

`pleasync.schema.yaml` を読み込み、強い型を持つ AST に変換する。`@pleasync/orm` と `pleasync` CLI が消費する。

## ステータス

🚧 **Phase 1（設計中）** — 公開 API 未確定。schema 仕様の議論中。

## 公開予定 API（変更前提）

```typescript
import { parseSchema, validateSchema } from '@pleasync/schema'

const yaml = await fs.readFile('pleasync.schema.yaml', 'utf-8')
const ast = parseSchema(yaml)
const result = validateSchema(ast)
if (!result.ok) throw new Error(result.errors.join('\n'))
```
