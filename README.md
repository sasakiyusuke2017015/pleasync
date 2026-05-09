# pleasync

Pleasanter 多環境構成管理ツール群。GitOps 流のスキーマ駆動開発を Pleasanter にもたらす。

## パッケージ

| パッケージ | npm | 役割 |
|---|---|---|
| [`@pleasync/client`](./packages/client) | [![npm](https://img.shields.io/npm/v/@pleasync/client.svg)](https://www.npmjs.com/package/@pleasync/client) | Pleasanter API ネイティブクライアント (Rust + napi-rs) |
| [`@pleasync/schema`](./packages/schema) | [![npm](https://img.shields.io/npm/v/@pleasync/schema.svg)](https://www.npmjs.com/package/@pleasync/schema) | スキーマ DSL のパーサ + AST + validator |
| [`@pleasync/orm`](./packages/orm) | [![npm](https://img.shields.io/npm/v/@pleasync/orm.svg)](https://www.npmjs.com/package/@pleasync/orm) | スキーマから生成される型付きランタイム |
| [`@pleasync/cli`](./packages/cli) | [![npm](https://img.shields.io/npm/v/@pleasync/cli.svg)](https://www.npmjs.com/package/@pleasync/cli) | `generate` / `plan` / `apply` / `introspect` |

## インストール（消費者向け）

低レベル API（直接 Pleasanter API を叩く）:

```bash
npm install @pleasync/client@beta
```

高レベル ORM（schema 駆動の型付きクライアント、Prisma 風）:

```bash
npm install @pleasync/orm@beta @pleasync/client@beta
npm install -D @pleasync/cli@beta @pleasync/schema@beta

# pleasync.schema.yaml を書く → 型付きクライアントを生成
npx pleasync generate
```

スキーマと Pleasanter の差分管理:

```bash
npx pleasync introspect --package ./pleasanter-export.json --out schema.yaml
npx pleasync plan
npx pleasync apply
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
| 1 | ✅ | `@pleasync/schema` Schema DSL + parser |
| 2 | ✅ | `@pleasync/orm` codegen runtime + `pleasync generate` |
| 2.5 | ✅ | `where` operator (equals/in) + `orderBy` |
| 3 | ✅ | `pleasync plan` / `apply` （Pleasanter 側に schema 反映） |
| 4 | ✅ | `pleasync introspect` (個別 siteId / SitePackage JSON) |
| 2.6 | 📋 | `relation include` (join) / 演算子拡充 (contains, gt/lt 等) |
| 3.3 | 📋 | `--allow-destroy` で site/column 削除 |

## リリースフロー

リポジトリは 2 つの release tag pattern を使い分けます:

| tag | 対象 | workflow |
|---|---|---|
| `client-v*.*.*` (or `v*.*.*`) | `@pleasync/client` (napi-rs ネイティブ) | `.github/workflows/release.yml` |
| `bundle-v*.*.*` | `@pleasync/schema` + `@pleasync/orm` + `pleasync` (lockstep) | `.github/workflows/release-ts.yml` |

dist-tag 自動振り分け:
- `*-beta.N` / `*-alpha.N` / `*-rc.N` → `beta`
- それ以外 → `latest`

## ライセンス

MIT
