# リリースフロー

## tag 命名と対応 workflow

| tag pattern | 対象 | workflow |
|---|---|---|
| `client-v*.*.*` (and `v*.*.*`) | `@pleasync/client` (Rust + napi-rs) | `.github/workflows/release.yml` |
| `bundle-v*.*.*` | `@pleasync/schema` + `@pleasync/orm` + `@pleasync/cli` (lockstep) | `.github/workflows/release-ts.yml` |

## dist-tag 自動振り分け

| tag suffix | dist-tag |
|---|---|
| `*-beta.N` | `beta` |
| `*-alpha.N` | `beta` |
| `*-rc.N` | `beta` |
| (suffix なし) | `latest` |

## TS パッケージのリリース手順

3 パッケージ (`schema` / `orm` / `cli`) を **lockstep** で公開する。

### 1. バージョン bump

各 `package.json` の `version` を揃えて更新:

```
packages/schema/package.json
packages/orm/package.json
packages/cli/package.json
```

PR にして merge。

### 2. tag を切って push

```bash
git switch main && git pull
git tag bundle-v0.1.0-beta.3
git push origin bundle-v0.1.0-beta.3
```

### 3. CI が自動で publish

`release-ts.yml` が走り:

1. `pnpm install --frozen-lockfile`
2. dist-tag 判定（`-beta.*` → beta、それ以外 → latest）
3. `pnpm --filter @pleasync/schema build`
4. `pnpm --filter @pleasync/orm build`
5. `pnpm --filter @pleasync/cli build`
6. 各 package を `pnpm publish --access public --tag <dist-tag>`
7. GitHub Release 作成

### 4. 確認

```bash
curl https://registry.npmjs.org/-/package/@pleasync%2fschema/dist-tags
curl https://registry.npmjs.org/-/package/@pleasync%2form/dist-tags
curl https://registry.npmjs.org/-/package/@pleasync%2fcli/dist-tags
```

## `@pleasync/client` のリリース手順

別 release track。multi-platform native binary なので OS マトリクスでビルド。

### 1. バージョン bump

`packages/client/package.json` を更新（`@pleasync/orm` の peerDependencies range に注意、必要なら orm 側も同時 bump）。

### 2. tag を切って push

```bash
git tag client-v0.1.2-beta.1
git push origin client-v0.1.2-beta.1
```

### 3. CI が publish

`release.yml`:

1. matrix で各 platform をビルド（Win x64/ARM64, macOS ARM64, Linux x64/ARM64）
2. `pnpm publish` で main + platform sub-packages を一括 publish
3. GitHub Release 作成

## dist-tag align

`bundle-v*-beta.*` で publish すると `latest` が古いバージョンを指したままになることがある（npm の挙動）。`@pleasync/cli` 以外で発生:

- 1 回目の beta publish 時、初回バージョンが latest にもなる
- 2 回目 beta publish は `--tag beta` なので latest は更新されない

修正: GitHub Actions の `dist-tag-align.yml` を workflow_dispatch で実行:

```
Settings → Actions → Workflows → Align dist-tags → Run workflow
  package: @pleasync/schema
  version: 0.1.0-beta.3
  tag: latest
```

## NPM_TOKEN ローテーション

token は GitHub Secrets の `NPM_TOKEN` に保存。漏洩時や定期更新で:

1. https://www.npmjs.com/settings/<user>/tokens
   - 既存 token を Revoke
   - Generate New Token (Granular / Bypass 2FA / `@pleasync` scope / Read+Write)
2. https://github.com/sasakiyusuke2017015/pleasync/settings/secrets/actions
   - `NPM_TOKEN` を Update（チャット経由しない、ブラウザに直接ペースト）

ローカル `npm login` は CI 用 token とは独立。

## 公開済バージョン

| Package | latest | beta |
|---|---|---|
| `@pleasync/client` | 0.1.1-beta.2 | 0.1.1-beta.2 |
| `@pleasync/schema` | (latest 公開時点) | (beta 公開時点) |
| `@pleasync/orm` | 同上 | 同上 |
| `@pleasync/cli` | 同上 | 同上 |

最新は npm ページで確認:

- https://www.npmjs.com/package/@pleasync/client
- https://www.npmjs.com/package/@pleasync/schema
- https://www.npmjs.com/package/@pleasync/orm
- https://www.npmjs.com/package/@pleasync/cli
