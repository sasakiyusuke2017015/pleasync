# pleasync (CLI)

Pleasync の CLI ツール。`generate` / `plan` / `apply` / `introspect` を提供する（予定）。

## ステータス

🚧 **Phase 2（未実装）** — 現状は help テキストのみ出力するスタブ。

## インストール（将来）

```bash
npm install -D pleasync
npx pleasync generate
```

## コマンド一覧（予定）

| コマンド | 機能 |
|---|---|
| `pleasync generate` | `pleasync.schema.yaml` から型付きクライアントを生成 |
| `pleasync plan` | Pleasanter の現状と schema の差分をプレビュー |
| `pleasync apply` | schema を Pleasanter に適用（site 作成・更新） |
| `pleasync introspect <siteId>` | 既存 Pleasanter サイトから schema を逆生成 |
