# Getting Started

5 分で pleasync を始めるチュートリアル。

## 前提

- Node.js 18 以上
- アクセス可能な Pleasanter インスタンス（API key を取得しておく）

## 1. インストール

```bash
npm install @pleasync/orm @pleasync/client
npm install -D @pleasync/cli @pleasync/schema
```

## 2. schema を書く

プロジェクトルートに `pleasync.schema.yaml` を作る:

```yaml
version: '1'

server:
  baseUrl: ${PLEASANTER_BASE_URL}
  apiKey:  ${PLEASANTER_API_KEY}
  apiVersion: '1.1'

choices:
  CustomerStatus:
    - { value: 100, label: 'アクティブ' }
    - { value: 900, label: '休止' }

models:
  customer:
    type: Results
    parentId: 35534          # 親フォルダの SiteId
    siteId:   35535          # 既存サイト（もしくは省略して apply で生成）
    title:    顧客マスタ
    fields:
      code:
        slot: ClassA
        label: 顧客コード
        type: text
        required: true
      name:
        slot: ClassB
        label: 名前
        type: text
        required: true
      status:
        slot: Status
        label: 状況
        type: status
        choices: CustomerStatus
        default: 100
```

詳細は [schema-spec.md](./schema-spec.md) 参照。

## 3. （オプション）既存 Pleasanter から逆生成

手書きが面倒なら `introspect` で:

```bash
# 単一 site
npx pleasync introspect 35535 --out pleasync.schema.yaml

# Pleasanter UI から SitePackage JSON エクスポート → 一括取り込み
npx pleasync introspect --package ./pleasanter-export.json --out pleasync.schema.yaml
```

## 4. 型付きクライアントを生成

```bash
npx pleasync generate
# → ./pleasync-generated/index.ts が出力される
```

## 5. アプリから使う

```typescript
import { PleasyncClient } from './pleasync-generated';

const client = await PleasyncClient.fromConfig({
  baseUrl: process.env.PLEASANTER_BASE_URL!,
  apiKey:  process.env.PLEASANTER_API_KEY!,
});

// 作成（型補完が効く、status は 100 | 900 の literal union）
const customer = await client.customer.create({
  data: { code: 'C-001', name: 'サンプル', status: 100 },
});

// 検索（演算子も使える）
const list = await client.customer.findMany({
  where: {
    status: 100,
    code: { contains: 'C-' },
  },
  orderBy: { code: 'asc' },
  take: 10,
});

// ID で取得
const one = await client.customer.findUnique({ where: { id: customer.id } });

// 更新
await client.customer.update({
  where: { id: customer.id },
  data: { status: 900 },
});

// 削除
await client.customer.delete({ where: { id: customer.id } });
```

## 6. （オプション）schema を Pleasanter に反映

手書きで schema を変更したら `plan` で差分確認 → `apply` で Pleasanter に書き込み:

```bash
npx pleasync plan
# +/~/= で diff が出る

npx pleasync apply
# 実行
```

詳細は [cli.md](./cli.md) 参照。

## Next.js での利用

サーバーサイドで使う前提（API Route / Server Component / Server Action）。
`next.config.js` に external 指定が必要:

```javascript
module.exports = {
  serverExternalPackages: ['@pleasync/client', '@pleasync/orm'],
};
```

詳細は `examples/nextjs/` を参照。

## トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| `Failed to load native binding` | platform 別 sub-package が npm に未公開、または環境不一致。`npm install` のログを確認 |
| `unsupported schema version: '2'` | schema の version は現在 `'1'` のみ |
| Next.js で `.node` バンドルエラー | `serverExternalPackages` に `@pleasync/client` `@pleasync/orm` を含めること |
| `--package` で取り込めない | Pleasanter UI からエクスポートした SitePackage JSON か確認、BOM 付きでも OK |
