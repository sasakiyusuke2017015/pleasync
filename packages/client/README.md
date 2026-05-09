# @pleasync/client

Pleasanter API クライアント。Rust (napi-rs) で実装された高速ネイティブバインディング。

[![npm version](https://img.shields.io/npm/v/@pleasync/client.svg)](https://www.npmjs.com/package/@pleasync/client)
[![npm beta](https://img.shields.io/npm/v/@pleasync/client/beta.svg?label=beta)](https://www.npmjs.com/package/@pleasync/client)
[![CI](https://github.com/sasakiyusuke2017015/pleasync-client/actions/workflows/CI.yml/badge.svg)](https://github.com/sasakiyusuke2017015/pleasync-client/actions/workflows/CI.yml)

## インストール

```bash
# 安定版
npm install @pleasync/client

# beta（マルチプラットフォーム検証中）
npm install @pleasync/client@beta
```

## 使い方

### 基本

```typescript
import { PleasanterClient } from '@pleasync/client'

const client = new PleasanterClient({
  baseUrl: 'https://pleasanter.example.com',
  apiKey: 'your-api-key',
  apiVersion: '1.1',
})
```

### サイト操作

```typescript
const site = await client.getSite(12345)
await client.updateSite(12345, { Title: '新しいタイトル' })
```

### レコード操作

```typescript
const records = await client.getRecords(67890)  // 自動ページネーション
```

### JSON 正規化

```typescript
import { normalize, sortedJsonStringify } from '@pleasync/client'

const cleaned = normalize(rawJson)         // 不要キー除外 + キーソート
const json = sortedJsonStringify(rawData, 2)  // キーソートして文字列化
```

## API

### `new PleasanterClient(config)`

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `config.baseUrl` | `string` | Yes | サーバー URL |
| `config.apiKey` | `string` | Yes | API キー |
| `config.apiVersion` | `string` | Yes | API バージョン（例: `"1.1"`） |

### メソッド

| メソッド | 戻り値 | 説明 |
|---------|--------|------|
| `getSite(siteId)` | `Promise<any>` | サイト情報を取得 |
| `updateSite(siteId, data)` | `Promise<any>` | サイト設定を更新 |
| `getRecords(siteId)` | `Promise<any[]>` | レコードを全件取得 |

### ユーティリティ関数

| 関数 | 説明 |
|------|------|
| `normalize(value)` | 不要キー除外 + キーソート |
| `sortedJsonStringify(value, indent?)` | キーソートして JSON 文字列化 |

## 対応プラットフォーム

各 platform 用のネイティブバイナリは `optionalDependencies` 経由で自動選択されます。

| OS | アーキテクチャ | パッケージ |
|----|--------------|-----------|
| Windows | x64 | `@pleasync/client-win32-x64-msvc` |
| Windows | ARM64 | `@pleasync/client-win32-arm64-msvc` |
| macOS | ARM64 (Apple Silicon) | `@pleasync/client-darwin-arm64` |
| Linux | x64 (glibc) | `@pleasync/client-linux-x64-gnu` |
| Linux | ARM64 (glibc) | `@pleasync/client-linux-arm64-gnu` |

> macOS Intel (x86_64) は未対応（GitHub-hosted runner のキュー混雑のため当面除外）。必要なら issue にて。
>
> Linux musl (Alpine 等) は未対応。必要なら issue にて。

## Next.js での利用

サーバーサイド（API Route / Server Component / Server Action）でのみ利用可能。Edge Runtime では動きません。

```javascript
// next.config.js
module.exports = {
  serverExternalPackages: ['@pleasync/client'],
}
```

実動作のサンプルは [`examples/nextjs-test/`](./examples/nextjs-test) を参照。

## 開発

### ローカルビルド

```powershell
npm install
npm run build           # release build (host platform)
npm run build:debug     # debug build
```

### テスト

```powershell
cargo test
```

### リリース

このリポジトリは GitHub Actions で **タグ push をトリガーに自動公開** されます。手動で `npm publish` する必要はありません。

#### バージョニング戦略

| バージョン形式 | 例 | npm dist-tag | 用途 |
|---|---|---|---|
| `vX.Y.Z` | `v0.1.1` | `latest` | 安定版 |
| `vX.Y.Z-beta.N` | `v0.1.1-beta.1` | `beta` | プレリリース・検証用 |
| `vX.Y.Z-rc.N` | `v0.1.1-rc.1` | `beta` | リリース候補 |
| `vX.Y.Z-alpha.N` | `v0.2.0-alpha.1` | `beta` | 早期検証 |

#### 手順

1. ローカルで作業ブランチから main へマージ
2. `npm version <patch|minor|major|prerelease>` でバージョン更新
   - 例: `npm version prerelease --preid=beta` → `0.1.1` → `0.1.1-beta.1`
   - 各 `npm/<triple>/package.json` のバージョンも `napi version` で同期されます
3. `git push --follow-tags` でタグも push
4. GitHub Actions が:
   - 全 platform でビルド (Windows x64/ARM64, macOS x64/ARM64, Linux x64/ARM64)
   - 各 platform package を npm に publish
   - main package を npm に publish
   - GitHub Release を作成

#### 検証フロー

```
[v0.1.1-beta.1 タグを切る]
  → GitHub Actions が beta タグで publish
  → examples/nextjs-test/ で動作確認
    cd examples/nextjs-test
    npm install        # @pleasync/client@beta が入る
    npm run dev
    curl localhost:3000/api/health
  → OK なら v0.1.1 タグで stable 公開
```

詳細な検証手順は [`examples/nextjs-test/README.md`](./examples/nextjs-test/README.md) を参照。

## ライセンス

MIT
