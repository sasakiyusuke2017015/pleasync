# pleasync

Pleasanter 多環境構成管理ツール群。GitOps 流のスキーマ駆動開発を Pleasanter にもたらす。

## パッケージ

| パッケージ | npm | 役割 |
|---|---|---|
| [`@pleasync/client`](./packages/client) | [![npm](https://img.shields.io/npm/v/@pleasync/client.svg)](https://www.npmjs.com/package/@pleasync/client) | Pleasanter API ネイティブクライアント (Rust + napi-rs) |
| [`@pleasync/schema`](./packages/schema) | (未公開) | スキーマ DSL のパーサ + AST + validator |
| [`@pleasync/orm`](./packages/orm) | (未公開) | スキーマから生成される型付きランタイム |
| [`pleasync` (CLI)](./packages/cli) | (未公開) | `generate` / `plan` / `apply` / `introspect` |

## インストール（消費者向け、現状）

```bash
# 既に動く: 低レベル API
npm install @pleasync/client@beta
```

```bash
# 将来: 高レベル ORM
npm install @pleasync/orm@beta pleasync@beta --save-dev
npx pleasync generate
```

## ディレクトリ構成

```
pleasync/
├── packages/
│   ├── client/              ← @pleasync/client (低レベル napi-rs クライアント)
│   ├── schema/              ← @pleasync/schema (Phase 1)
│   ├── orm/                 ← @pleasync/orm (Phase 2)
│   └── cli/                 ← pleasync CLI (Phase 2)
├── examples/
│   └── nextjs/              ← Next.js 統合テスト
├── .github/workflows/       ← CI/release
├── pnpm-workspace.yaml
└── package.json (workspace root)
```

## 開発

```bash
pnpm install        # workspace 全体の依存解決
pnpm -r build       # 全パッケージビルド
pnpm -r test        # 全パッケージテスト
```

特定 package のみ:

```bash
pnpm --filter @pleasync/client build
pnpm --filter @pleasync/orm test
```

## Phase

| Phase | 状態 | 内容 |
|---|---|---|
| 0 | ✅ | `@pleasync/client` 公開（low-level API） |
| 1 | 🚧 | `@pleasync/schema` Schema DSL + parser |
| 2 | 📋 | `@pleasync/orm` codegen runtime + `pleasync` CLI generate |
| 3 | 📋 | CLI の `plan` / `apply` （Pleasanter 側に schema 反映） |
| 4 | 📋 | `introspect` （Pleasanter から schema 逆生成） |

## ライセンス

MIT
