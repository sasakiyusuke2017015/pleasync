/**
 * Pleasanter API の薄いインターフェース。
 *
 * @pleasync/client の `PleasanterClient` がこの形を満たす。テストでは fake を注入可能。
 */
export interface PleasanterApi {
  getSite(siteId: number): Promise<unknown>;
  createSite(parentId: number, siteData: unknown): Promise<number>;
  updateSite(siteId: number, siteData: unknown): Promise<void>;
  deleteSite(siteId: number): Promise<void>;
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

/**
 * where 句の値部分。リテラル値（equals 略記）か演算子オブジェクト。
 *
 * 例:
 *   `{ status: 100 }`            → status equals 100
 *   `{ status: { equals: 100 } }` → 同上
 *   `{ status: { in: [100, 200] } }` → status IN (100, 200)
 */
export type WhereOperator<T> =
  | T
  | {
      equals?: T;
      in?: readonly T[];
    };

/** orderBy の方向 */
export type OrderByDirection = 'asc' | 'desc';

/** findMany 引数 */
export interface FindManyArgs<TWhere, TOrderBy = Record<string, OrderByDirection>> {
  where?: TWhere;
  orderBy?: TOrderBy;
  take?: number;
  skip?: number;
}
