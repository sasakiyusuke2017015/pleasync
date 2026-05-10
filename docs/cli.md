# CLI リファレンス: `pleasync`

`@pleasync/cli` が提供する 4 コマンドのリファレンス。

```bash
npx pleasync <command> [options]
```

## コマンド一覧

| コマンド | 内容 |
|---|---|
| [`generate`](#pleasync-generate) | schema → 型付きクライアント TS 生成 |
| [`introspect`](#pleasync-introspect) | 既存 Pleasanter から schema 逆生成 |
| [`plan`](#pleasync-plan) | schema と Pleasanter 現状の差分表示（read-only） |
| [`apply`](#pleasync-apply) | schema を Pleasanter に反映（create/update） |

## 共通: 接続情報

`apply`/`plan`/`introspect` は Pleasanter API 接続が必要。優先順位:

1. CLI 引数 (`--base-url`, `--api-key`, `--api-version`)
2. 環境変数 (`PLEASANTER_BASE_URL`, `PLEASANTER_API_KEY`, `PLEASANTER_API_VERSION`)

`generate` は接続不要（schema ファイルのみで動作）。

---

## `pleasync generate`

schema YAML から TypeScript の型付きクライアントを生成。

```bash
pleasync generate                              # ./pleasync.schema.yaml → ./pleasync-generated/index.ts
pleasync generate --schema ./db/schema.yaml    # 別 schema パス
pleasync generate --out ./src/generated        # 別出力先
pleasync generate --stdout                     # 標準出力（ファイル書かない）
```

### オプション

| | 内容 |
|---|---|
| `--schema <path>` | schema YAML のパス（デフォルト: `./pleasync.schema.yaml`）|
| `--out <dir>` | 出力先ディレクトリ（デフォルト: `./pleasync-generated`） |
| `--stdout` | ファイルに書かず stdout に出力 |
| `-h, --help` | ヘルプ |

### 生成される型

1 model につき:

| 型 | 内容 |
|---|---|
| `<Pascal>Record` | read 時の record 型 (`id`, fields, `createdAt`, `updatedAt`) |
| `<Pascal>CreateInput` | create 時の入力（`required: true` のみ必須） |
| `<Pascal>UpdateInput` | update 時の入力（全 field optional） |
| `<Pascal>Where` | findMany の where 句（`WhereOperator<T>` でラップ） |
| `<Pascal>OrderBy` | orderBy の direction map |
| `<Pascal>Include` | include 句（relation field のみ列挙） |

トップレベル: `PleasyncClient` クラスに各 model の collection が `readonly` で生える。

---

## `pleasync introspect`

既存 Pleasanter サイトから schema YAML を逆生成。

### 経路 A: API 経由（個別 siteId）

```bash
pleasync introspect 35535
pleasync introspect 35535 35536 --out pleasync.schema.yaml
pleasync introspect 35535 --base-url http://192.168.10.64 --api-key abc...
```

### 経路 B: SitePackage JSON 一括

Pleasanter UI で「サイトパッケージのエクスポート」を実行 → 取得した JSON を渡す:

```bash
pleasync introspect --package ./pleasanter-export.json --out schema.yaml
pleasync introspect --package ./export.json --include-folders   # フォルダ (Sites 型) も含める
```

API 接続不要。

### マッピング

| ColumnName | logical type |
|---|---|
| Title / Body / Manager / Owner | `text` |
| Class\* | `class` (with choices) または `text` |
| Num\* | `number` |
| Date\* / StartTime / CompletionTime | `datetime` |
| Description\* | `description` |
| Check\* | `check` |
| Status | `status` (ChoicesText パース) |
| IssueId / ResultId / Comments / Creator / Updator / Ver | (skip) |

### 制約

- relation は推定不可（手動編集必要）
- 日本語タイトルは識別子に変換できないので `site<id>` にフォールバック

---

## `pleasync plan`

schema と Pleasanter 現状の差分を表示（**副作用なし**）。

```bash
pleasync plan
pleasync plan --schema ./schema.yaml
```

### 出力例

```
+ invoice — create new site
    type: Results
    parentId: 35534
    title: 請求書
    fields: 3
~ customer (siteId=35535) — update
    title: "顧客マスタ" → "顧客マスタ v2"
    + column ClassC (text) "メモ"
    ~ column ClassA label: "コード" → "顧客コード"
= order (siteId=35540) — no changes

Plan: 1 to create, 1 to update, 1 unchanged.
```

### 検出される変更

| 種別 | 条件 |
|---|---|
| `+ create` | siteId 未指定 or getSite が 404 |
| `~ update / title` | model.title と Pleasanter Title 不一致 |
| `~ update / + column` | schema fields にあるが site columns に無い slot |
| `~ update / ~ column-label` | LabelText 不一致 |
| `~ update / ~ column-choices` | Status/Class の ChoicesText 不一致 |
| `(orphan)` | site にあるが schema に無い column（情報のみ）|
| `= unchanged` | 全部一致 |

---

## `pleasync apply`

`plan` で計算した差分を Pleasanter に **書き込む**。

```bash
pleasync apply                            # 通常
pleasync apply --skip-schema-writeback    # siteId の自動書き戻しを抑止
pleasync apply --allow-destroy            # orphan column を削除（DESTRUCTIVE）
```

### 操作

| diff | 実行 API |
|---|---|
| create | `createSite(parentId, ...)` → `updateSite(newId, {Columns})` |
| update | `updateSite(siteId, {Title?, SiteSettings.Columns})` |
| unchanged | skip |

### schema write-back

`create` で得た新 siteId は schema YAML に **自動書き戻し**される（コメント・順序保持）。`--skip-schema-writeback` で抑止可能。

### `--allow-destroy`

デフォルトでは「schema にないが Pleasanter に存在する column」(orphan) は **保持**される。

```bash
pleasync apply --allow-destroy
```

を付けると orphan column を Pleasanter から削除する。**実データが失われる**ので注意。

site 自体の削除は対象外（schema から model を消しても site は残る、必要なら UI で手動削除）。

### 制約

- 確認プロンプトなし（`plan` で事前確認する設計）
- ロールバックなし（Pleasanter にトランザクションが無いため、partial failure 時は手動修復）
- 全 model 一括（一部だけの apply はできない）

### オプション

| | 内容 |
|---|---|
| `--schema <path>` | schema YAML パス（デフォルト: `./pleasync.schema.yaml`） |
| `--base-url <url>` | Pleasanter URL |
| `--api-key <key>` | API key |
| `--api-version <v>` | API version（デフォルト 1.1）|
| `--skip-schema-writeback` | siteId 自動書き戻し抑止 |
| `--allow-destroy` | orphan column 削除を許可 |
| `-h, --help` | ヘルプ |
