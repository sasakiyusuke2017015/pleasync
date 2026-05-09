/**
 * Pleasanter API の薄いインターフェース。
 *
 * @pleasync/client の `PleasanterClient` がこの形を満たす。テストでは fake を注入可能。
 */
export interface PleasanterApi {
  getRecord(recordId: number, options?: unknown): Promise<unknown>;
  getRecords(siteId: number): Promise<unknown[]>;
  getRecordsWithOptions(siteId: number, options?: unknown): Promise<unknown[]>;
  createRecord(siteId: number, data: unknown): Promise<number>;
  updateRecord(recordId: number, data: unknown): Promise<void>;
  deleteRecord(recordId: number): Promise<void>;
}

/** Engine への接続設定。 */
export interface EngineConfig {
  baseUrl: string;
  apiKey: string;
  apiVersion?: string;
}

/** Field type は schema package と一致 */
export type FieldRuntimeType =
  | 'text'
  | 'number'
  | 'datetime'
  | 'boolean'
  | 'description'
  | 'status'
  | 'class'
  | 'check'
  | 'relation';

/** 1 field のランタイム定義（codegen が埋め込む） */
export interface FieldRuntimeDef {
  /** Pleasanter の物理 slot 名 (ClassA, NumA, Status, Title など) */
  slot: string;
  /** Field の論理 type */
  type: FieldRuntimeType;
}

/** Pleasanter の ReferenceType */
export type ReferenceType = 'Sites' | 'Issues' | 'Results' | 'Wikis';

/** 1 model のランタイム定義（codegen が埋め込む） */
export interface ModelDef {
  type: ReferenceType;
  /** 親フォルダ siteId */
  parentId: number;
  /** model 自身の siteId（必須）*/
  siteId: number;
  /** logical name → field 定義 */
  fieldMap: Record<string, FieldRuntimeDef>;
}

/** findUnique / update / delete の where 句 */
export interface IdWhere {
  id: number;
}

/** findMany 引数 */
export interface FindManyArgs<TWhere> {
  where?: TWhere;
  take?: number;
  skip?: number;
}
