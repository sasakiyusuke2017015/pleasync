# pleasync-client integration test (Next.js)

`@pleasync/client` を npm 経由で install し、Next.js (App Router) のサーバーサイドから呼び出せることを検証するサンプル。

## 前提

- `@pleasync/client@beta` が npm に publish されていること
- 自分のマシンの platform 用 binary が npm 上に存在すること
- 動作確認用の Pleasanter サーバー（GET 可能なサイト 1 つ）

## 手順

```powershell
# 1. 環境変数
Copy-Item .env.example .env.local
notepad .env.local   # 値を埋める

# 2. install (beta tag からマシン用 binary が optionalDependencies で入る)
npm install

# 3. dev server
npm run dev

# 4. 動作確認
#    バインディングのロードと client 構築の確認 (Pleasanter には接続しない)
Invoke-WebRequest http://localhost:3000/api/health | Select-Object -ExpandProperty Content

#    実際に Pleasanter にアクセス (要 .env.local)
Invoke-WebRequest "http://localhost:3000/api/site?id=$env:PLEASANTER_TEST_SITE_ID" | Select-Object -ExpandProperty Content
```

## 期待結果

### `/api/health`

```json
{
  "ok": true,
  "nativeBindingLoaded": true,
  "exported": ["PleasanterClient", "normalize", "sortedJsonStringify"],
  "constructed": true,
  "env": { "hasBaseUrl": true, "hasApiKey": true, "apiVersion": "1.1" },
  "runtime": { "node": "vXX.X.X", "platform": "win32", "arch": "x64" }
}
```

### `/api/site?id=<siteId>`

```json
{
  "ok": true,
  "siteId": 12345,
  "site": { /* Pleasanter のレスポンス */ }
}
```

## 確認ポイント

| チェック項目 | 確認方法 |
|---|---|
| **install が通る** | `npm install` が optionalDependencies の解決でエラーを出さない |
| **platform binary が選ばれる** | `node_modules/@pleasync/client-<triple>/` が存在 |
| **bundler が `.node` を壊さない** | `next dev` 起動時にエラーなし |
| **server-side で require できる** | `/api/health` が `ok: true` |
| **API 呼び出しが動く** | `/api/site` で実 Pleasanter のレスポンスが返る |
| **`next build` でも壊れない** | `npm run build` が成功する |

## トラブルシュート

| 症状 | 原因 | 対処 |
|---|---|---|
| `Failed to load native binding` | platform 別 sub-package が npm に未公開 | リリース workflow が全 platform をビルドしているか確認 |
| `Module not found: @pleasync/client` | install 失敗 | `npm install --force` / lockfile 削除して再実行 |
| `next build` 時に webpack エラー | `serverExternalPackages` 未設定 | `next.config.js` を確認 |
| Edge Runtime / Client Component で死ぬ | `.node` は server-side Node 限定 | 該当 route から `runtime = 'edge'` を外す / `"use server"` 側で呼ぶ |
