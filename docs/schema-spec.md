# pleasync Schema DSL 仕様 (v1)

`pleasync.schema.yaml` フォーマット定義。`@pleasync/schema` がパースし、`@pleasync/orm` の codegen / `pleasync` CLI の plan・apply が消費する。

## 設計判断

| 項目 | 決定 | 根拠 |
|---|---|---|
| `slot` 指定 | **明示必須** | 再生成の決定性、Pleasanter の固定スロット制約に正直 |
| `choices` の生成型 | **value union** + `labelOf()` ヘルパー | Pleasanter API が value で動く。label は表示限定 |
| logical name の case | **camelCase** | JS/TS 慣習。Pleasanter の `ClassA` は実装詳細扱い |
| apply の方針 | **Terraform 風 plan / apply** | `--allow-destroy` で破壊操作を明示。Phase 3 で実装 |

## トップレベル構造

```yaml
version: '1'

server:                              # オプション、CLI が読み込む
  baseUrl: ${PLEASANTER_BASE_URL}
  apiKey:  ${PLEASANTER_API_KEY}
  apiVersion: '1.1'

choices:                             # 共有選択肢、各 model から名前で参照可能
  ActiveInactive:
    - { value: 100, label: 'アクティブ' }
    - { value: 900, label: '休止' }

models:                              # 1 model = Pleasanter の 1 site
  customer:
    type: Results
    parentId: 35534
    title: 顧客マスタ
    fields:
      code:
        slot: ClassA
        label: 顧客コード
        type: text
        unique: true
      ...
```

## `version`

- 値: `'1'` リテラル（文字列）
- 必須
- Phase 1 では `'1'` のみ受け入れる。将来の DSL 進化で `'2'` 等を追加するためのフォーマット世代識別子

## `server`

オプションのサーバー接続情報。CLI (`apply`, `plan`, `introspect`) のデフォルト接続先。アプリ実行時には不要（消費側コードが PleasanterClient を構築する）。

| キー | 型 | 必須 | 内容 |
|---|---|---|---|
| `baseUrl` | string | yes | Pleasanter のベース URL |
| `apiKey` | string | yes | API キー |
| `apiVersion` | string | no | デフォルト `'1.1'` |

`${ENV_VAR}` 構文で環境変数展開可（`server.*` 配下のみ）。

## `choices`

オプション。複数 model で共有する選択肢を再利用。

```yaml
choices:
  <名前>:
    - { value: <number|string>, label: <string> }
    - ...
```

- `value` は number または string（Pleasanter API に渡す値）
- `label` は表示用文字列
- 各 choice は value/label 両方必須
- value は同一 choices 内で一意

model 側からは `choices: ActiveInactive` と名前で参照する。

## `models`

オブジェクト。キー = logical name (camelCase)、値 = Model 定義。

### Model 定義

```yaml
<modelName>:
  type: Sites | Issues | Results | Wikis
  parentId: <number>
  title: <string>
  fields:
    <fieldName>:
      slot: <ColumnName>
      label: <string>
      type: <FieldType>
      ...
```

| キー | 型 | 必須 | 内容 |
|---|---|---|---|
| `type` | `Sites \| Issues \| Results \| Wikis` | yes | Pleasanter の ReferenceType |
| `parentId` | number | yes | 親サイトの SiteId |
| `title` | string | yes | Pleasanter UI 表示名 |
| `fields` | object | yes | フィールド定義の集合 |

### Field 定義

```yaml
<fieldName>:
  slot: <ColumnName>           # Pleasanter の物理カラム名 (ClassA, NumA, Status 等)
  label: <string>              # Pleasanter UI ラベル
  type: <FieldType>
  required?: boolean           # default false
  unique?: boolean             # default false (Phase 1 では検証のみ、enforce はしない)
  default?: <value>            # default 値
  choices?: <name | inline>    # type: status | class のとき
  to?: <modelName>             # type: relation のとき必須
```

### FieldType と slot の対応

| `type` | 許容 slot プレフィックス | TypeScript 生成型（Phase 2）|
|---|---|---|
| `text` | `Class*`, `Title`, `Body` | `string` |
| `number` | `Num*` | `number` |
| `datetime` | `Date*`, `StartTime`, `CompletionTime`, `CreatedTime`, `UpdatedTime` | `Date \| string` |
| `boolean` | `Check*` | `boolean` |
| `description` | `Description*` | `string` (long) |
| `status` | `Status` のみ | choices の value union |
| `class` | `Class*` | choices の value union |
| `check` | `Check*` | `boolean` |
| `relation` | `Class*`（Pleasanter の Link 機能） | 関連 model の record 型 |

### slot プレフィックスのバリエーション（Pleasanter 標準）

- `ClassA` 〜 `ClassZ` (text / class / relation)
- `NumA` 〜 `NumZ` (number)
- `DateA` 〜 `DateZ` (datetime)
- `DescriptionA` 〜 `DescriptionZ` (description)
- `CheckA` 〜 `CheckZ` (check)
- `Status` (status)
- 標準カラム: `Title`, `Body`, `Manager`, `Owner`
- Issues 専用: `IssueId`, `StartTime`, `CompletionTime`, `ProgressRate`
- Results 専用: `ResultId`
- 共通システム: `CreatedTime`, `UpdatedTime`, `Creator`, `Updator`

## バリデーションルール (Phase 1)

| ルール | エラー例 |
|---|---|
| `version` が `'1'` でない | "unsupported schema version: '2'" |
| model 内で同じ slot を 2 回使用 | "duplicate slot 'ClassA' in model customer" |
| slot プレフィックスと type の不整合 | "type 'number' requires Num\* slot, got 'ClassA'" |
| `choices: <名前>` が `choices` セクションに未定義 | "unknown choices reference 'ActiveInactive'" |
| `choices` の value が重複 | "duplicate choice value 100 in 'ActiveInactive'" |
| inline choices で value/label 欠落 | "choice missing 'value' field" |
| `type: relation` で `to` 未指定 | "relation field 'customerId' missing 'to'" |
| `to` が未定義 model を指す | "unknown model 'customer' referenced from invoice.customerId" |
| modelName が camelCase でない | "model name 'Customer' must be camelCase" |
| fieldName が camelCase でない | "field name 'CustomerCode' must be camelCase" |

## 環境変数展開

`${VAR_NAME}` は `process.env.VAR_NAME` で展開。展開対象は `server.baseUrl`, `server.apiKey` のみ。

未定義の環境変数を参照した場合: パース時にエラー（`required env var 'X' is not set`）。

## 例: 完全な schema

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
  IssuePriority:
    - { value: 1, label: '低' }
    - { value: 2, label: '中' }
    - { value: 3, label: '高' }

models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客マスタ
    fields:
      code:
        slot: ClassA
        label: 顧客コード
        type: text
        unique: true
      name:
        slot: ClassB
        label: 名前
        type: text
        required: true
      email:
        slot: ClassE
        label: メールアドレス
        type: text
      status:
        slot: Status
        label: 状況
        type: status
        choices: CustomerStatus
        default: 100

  issue:
    type: Issues
    parentId: 35534
    title: 案件管理
    fields:
      ticketNumber:
        slot: ClassA
        label: 案件番号
        type: text
        unique: true
      customerId:
        slot: ClassB
        label: 顧客
        type: relation
        to: customer
      priority:
        slot: ClassC
        label: 優先度
        type: class
        choices: IssuePriority
      startDate:
        slot: StartTime
        label: 開始日
        type: datetime
      completionDate:
        slot: CompletionTime
        label: 完了日
        type: datetime
```

## 後続フェーズに先送りした項目

| 項目 | フェーズ |
|---|---|
| `roles` セクション（permission scoping）| Phase 3+ |
| `apply` の `--allow-destroy` 制御 | Phase 3 |
| `migrations/` ディレクトリ（変更履歴）| Phase 4 |
| 複数 schema ファイルの結合 (`include:`) | 将来 |
| カスタム validator / hook | 将来 |
