# アーキテクチャ

## パッケージ構成

```
pleasync/                                  ← monorepo (pnpm workspace)
├── packages/
│   ├── client/        @pleasync/client    Rust + napi-rs
│   ├── schema/        @pleasync/schema    DSL parser + AST + validator
│   ├── orm/           @pleasync/orm       runtime (Engine + ModelCollection + transform)
│   └── cli/           @pleasync/cli       CLI tool (generate / plan / apply / introspect)
├── examples/
│   └── nextjs/        Next.js (App Router) からの統合サンプル
└── docs/              本ドキュメント群
```

## 依存方向

```
              ┌──────────────────────────┐
              │  ユーザーアプリ (Next.js)│
              └─────────────┬────────────┘
                            ▼
              ┌──────────────────────────┐
              │     pleasync-generated   │  ← `pleasync generate` 出力
              │    (PleasyncClient)      │
              └────┬───────────────┬─────┘
                   │               │
                   ▼               ▼
            ┌──────────┐   ┌──────────────┐
            │@pleasync │   │ @pleasync/   │  ← 型・実装の中核
            │  /orm    │   │   schema     │
            │(runtime) │   │(parser/AST)  │
            └─────┬────┘   └──────────────┘
                  │
                  ▼ (dynamic import)
            ┌──────────────┐
            │ @pleasync/   │  ← Rust ネイティブ（HTTP + JSON 正規化）
            │   client     │
            └──────────────┘

              ┌──────────────────────────┐
              │     @pleasync/cli        │  ← `npx pleasync ...` で起動
              └──────────────────────────┘
                 │ depends:
                 ├─ @pleasync/orm
                 ├─ @pleasync/schema
                 └─ @pleasync/client (peer)
```

## レイヤーの責務

### `@pleasync/client` (Rust + napi-rs)
- Pleasanter API の HTTP 通信（reqwest）
- JSON 正規化（normalize / sortedJsonStringify）
- SitePackage 解析
- platform 別 native binary を npm sub-package で配布

### `@pleasync/schema`
- `pleasync.schema.yaml` を AST にパース
- 構造的バリデーション（slot/type 整合、relation 参照、camelCase 等）
- 環境変数展開（`resolveServerConfig`）

### `@pleasync/orm` (runtime)
- `Engine`: PleasanterClient ラッパー
- `ModelCollection<TRecord, TCreate, TUpdate, TWhere, TOrderBy, TInclude>`: CRUD 基底クラス
- `transform`: logical name ↔ Pleasanter wire format 変換
- where 演算子の server/client 分離処理

### `@pleasync/cli`
- `generate`: SchemaAst → TypeScript ソース文字列
- `introspect`: getSite / SitePackage JSON → SchemaAst → YAML
- `plan`: schema vs Pleasanter の diff 計算
- `apply`: diff を Pleasanter に書き込み

## Phase 進捗

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | `@pleasync/client` 公開 | ✅ |
| 1 | `@pleasync/schema` (parser + validator) | ✅ |
| 2 | `@pleasync/orm` + `pleasync generate` | ✅ |
| 2.5 | where (equals/in) + orderBy | ✅ |
| 2.6a | relation `include` | ✅ |
| 2.6b | where 演算子拡充 (not/notIn/contains/startsWith/endsWith/gt/gte/lt/lte) | ✅ |
| 3.1 | `pleasync plan` | ✅ |
| 3.2 | `pleasync apply` | ✅ |
| 3.3 | `--allow-destroy` | ✅ |
| 4 | `pleasync introspect` (siteId / SitePackage) | ✅ |
| 5 | docs 整備（this） | ✅ |

## 設計判断（一部抜粋）

| 判断 | 採用 | 根拠 |
|---|---|---|
| `slot` 指定 | 明示必須 | 再生成の決定性、Pleasanter 固定スロット制約 |
| `choices` の型 | value union (`100 \| 900`) | API は value で動く |
| logical name の case | camelCase | JS/TS 慣習 |
| `id` の表現 | 常に `id: number`（IssueId/ResultId を抽象化） | Prisma スタイル、消費側コードが統一 |
| 生成形式 | 単一 `pleasync-generated/index.ts` | デバッグ・git diff 容易 |
| codegen 方式 | テンプレート文字列 | ts-morph 等は overkill |
| update 戻り値 | `Promise<void>` | 再取得は別 findUnique |
| where 演算子 | server/client 分離 | Pleasanter API の制約に正直 |
| apply の方針 | Terraform 風 plan/apply | destroy は `--allow-destroy` 明示 |
| schema YAML 書き戻し | `yaml` Document API でコメント・順序保持 | 開発体験 |

## 関連ドキュメント

- 始め方: [getting-started.md](./getting-started.md)
- DSL 仕様: [schema-spec.md](./schema-spec.md)
- CLI: [cli.md](./cli.md)
- 生成クライアント API: [orm-api.md](./orm-api.md)
- リリース: [release.md](./release.md)
