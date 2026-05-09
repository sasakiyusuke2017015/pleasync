// Schema AST — pleasync.schema.yaml v1
//
// 詳細仕様: docs/schema-spec.md

/** トップレベル schema */
export interface SchemaAst {
  version: '1';
  server?: ServerConfig;
  choices?: Record<string, Choice[]>;
  models: Record<string, Model>;
}

/** サーバー接続情報（CLI 用、消費側コードでは無視）。 */
export interface ServerConfig {
  baseUrl: string;
  apiKey: string;
  apiVersion?: string;
}

/** 選択肢の単一エントリ */
export interface Choice {
  value: number | string;
  label: string;
}

/** Pleasanter の ReferenceType */
export type ReferenceType = 'Sites' | 'Issues' | 'Results' | 'Wikis';

/** Model = Pleasanter の 1 サイトの定義 */
export interface Model {
  type: ReferenceType;
  parentId: number;
  title: string;
  fields: Record<string, Field>;
}

/** Field type の論理名 */
export type FieldType =
  | 'text'
  | 'number'
  | 'datetime'
  | 'boolean'
  | 'description'
  | 'status'
  | 'class'
  | 'check'
  | 'relation';

/** Field の共通プロパティ */
interface FieldBase {
  slot: string;
  label: string;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
}

/** Field 定義（type ごとに必須プロパティが異なる） */
export type Field =
  | (FieldBase & { type: 'text' })
  | (FieldBase & { type: 'number' })
  | (FieldBase & { type: 'datetime' })
  | (FieldBase & { type: 'boolean' })
  | (FieldBase & { type: 'description' })
  | (FieldBase & { type: 'check' })
  | (FieldBase & { type: 'status'; choices: string | Choice[] })
  | (FieldBase & { type: 'class'; choices: string | Choice[] })
  | (FieldBase & { type: 'relation'; to: string });

/** バリデーション結果 */
export type ValidationResult =
  | { ok: true; ast: SchemaAst }
  | { ok: false; errors: ValidationError[] };

export interface ValidationError {
  /** エラーが発生したパス（例: "models.customer.fields.code"） */
  path: string;
  /** 人間向けメッセージ */
  message: string;
  /** カテゴリ（プログラム側でハンドリングする用） */
  code: ValidationErrorCode;
}

export type ValidationErrorCode =
  | 'unsupported_version'
  | 'invalid_structure'
  | 'duplicate_slot'
  | 'slot_type_mismatch'
  | 'unknown_choices_ref'
  | 'duplicate_choice_value'
  | 'invalid_choice_entry'
  | 'missing_relation_target'
  | 'unknown_relation_target'
  | 'invalid_camel_case'
  | 'invalid_reference_type'
  | 'env_var_not_set';
