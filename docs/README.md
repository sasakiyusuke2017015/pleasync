# pleasync ドキュメント

Pleasanter 用の Prisma 風 schema 駆動クライアント。schema YAML を書くと型付き CRUD クライアントが生成され、`plan` / `apply` で Pleasanter サイトと同期できる。

## ドキュメント一覧

| ドキュメント | 内容 |
|---|---|
| [getting-started.md](./getting-started.md) | 5 分で始める tutorial（install → schema → generate → 利用） |
| [schema-spec.md](./schema-spec.md) | DSL 仕様（version, server, choices, models, fields, validation rules） |
| [cli.md](./cli.md) | CLI コマンドリファレンス（generate / plan / apply / introspect） |
| [orm-api.md](./orm-api.md) | 生成されたクライアントの API（findUnique / findMany / where / orderBy / include / create / update / delete） |
| [architecture.md](./architecture.md) | パッケージ構成、フェーズ進捗、依存関係 |
| [release.md](./release.md) | リリースフロー（bundle-v* / client-v* tag、dist-tag align） |

## パッケージ別 README

各 npm パッケージページ（npmjs.com）にも掲載:

- [`@pleasync/client`](../packages/client/README.md) - 低レベル napi-rs クライアント
- [`@pleasync/schema`](../packages/schema/README.md) - DSL parser/validator
- [`@pleasync/orm`](../packages/orm/README.md) - typed ORM ランタイム
- [`@pleasync/cli`](../packages/cli/README.md) - CLI ツール

## 例

`examples/nextjs/` に Next.js (App Router) からの統合サンプル。
