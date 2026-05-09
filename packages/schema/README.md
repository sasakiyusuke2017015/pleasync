# @pleasync/schema

Pleasanter スキーマ DSL のパーサー・AST・validator。

## 役割

`pleasync.schema.yaml` を読み込み、強い型を持つ AST に変換 → 構造的なバリデーション。
`@pleasync/orm` と `pleasync` CLI が消費する。

## ステータス

✅ **Phase 1 完了** — parser + validator + tests (33 tests passing)

## 使い方

```typescript
import { parseSchema, validateSchema } from '@pleasync/schema'
import { readFile } from 'node:fs/promises'

const yaml = await readFile('pleasync.schema.yaml', 'utf-8')
const ast = parseSchema(yaml)
const result = validateSchema(ast)

if (!result.ok) {
  for (const err of result.errors) {
    console.error(`[${err.code}] ${err.path}: ${err.message}`)
  }
  process.exit(1)
}

// result.ok === true なら result.ast が型安全な SchemaAst
```

## 公開 API

### `parseSchema(yamlText: string): SchemaAst`

YAML 文字列をパースして AST を返す。

- YAML syntax error → `SyntaxError` を投げる
- `${ENV_VAR}` を `server.*` の中で展開する。未定義なら例外

### `validateSchema(ast: SchemaAst): ValidationResult`

AST を validate する。エラーを **全て集めて** 返す（早期 return しない）。

```typescript
type ValidationResult =
  | { ok: true;  ast: SchemaAst }
  | { ok: false; errors: ValidationError[] }

interface ValidationError {
  path: string                  // "models.customer.fields.code"
  message: string
  code: ValidationErrorCode     // 機械可読のカテゴリ
}
```

### `ValidationErrorCode`

| code | 内容 |
|---|---|
| `unsupported_version` | `version` が `'1'` でない |
| `invalid_structure` | 期待する構造でない（オブジェクト型違反等） |
| `duplicate_slot` | 同じ model 内で同じ slot を 2 回使った |
| `slot_type_mismatch` | type と slot のプレフィックスが不整合 |
| `unknown_choices_ref` | `choices: <名前>` が未定義 |
| `duplicate_choice_value` | choice の value が重複 |
| `invalid_choice_entry` | choice の value/label 欠落・不正 |
| `missing_relation_target` | `type: relation` で `to` 未指定 |
| `unknown_relation_target` | `to` が未定義 model を指す |
| `invalid_camel_case` | model/field 名が camelCase でない |
| `invalid_reference_type` | `type` が `Sites/Issues/Results/Wikis` 以外 |
| `env_var_not_set` | `${ENV_VAR}` で環境変数が未定義 |

## DSL 仕様

詳細は [`docs/schema-spec.md`](../../docs/schema-spec.md) を参照。

最小例:

```yaml
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客マスタ
    fields:
      code:
        slot: ClassA
        label: 顧客コード
        type: text
        unique: true
```

## テスト

```bash
pnpm --filter @pleasync/schema test
```

33 tests passing (parser 11 + validator 22)。

## ライセンス

MIT
