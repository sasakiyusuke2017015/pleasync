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
  /** type === 'relation' のときの参照先 model 名 (logical name) */
  targetModel?: string;
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
 * Server-side（Pleasanter ColumnFilterHash で送信）:
 *   `equals`, `in`
 *
 * Client-side（fetch 後に JS でフィルタ）:
 *   `not`, `notIn`, `contains`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`, `lte`
 *
 * 例:
 *   `{ status: 100 }`                 → status === 100 (server)
 *   `{ status: { in: [100, 200] } }`  → status IN (100, 200) (server)
 *   `{ code: { contains: 'C-' } }`    → code に 'C-' を含む (client)
 *   `{ amount: { gt: 1000 } }`        → amount > 1000 (client)
 *
 * 注: client-side ops は fetch した後に JS でフィルタするため、
 * 巨大なテーブルで take/skip と組み合わせる場合パフォーマンスに注意。
 */
export type WhereOperator<T> =
  | T
  | {
      equals?: T;
      in?: readonly T[];
      not?: T;
      notIn?: readonly T[];
      contains?: string;
      startsWith?: string;
      endsWith?: string;
      gt?: T;
      gte?: T;
      lt?: T;
      lte?: T;
    };

/** orderBy の方向 */
export type OrderByDirection = 'asc' | 'desc';

/**
 * include 句: 関連 model を fetch して結果に含めるかを指定する。
 *
 * 例: `{ customer: true }` で relation field `customer` の関連レコードを populate。
 */
export type IncludeArg = Record<string, boolean>;

/** findUnique 引数 */
export interface FindUniqueArgs<TInclude extends IncludeArg = IncludeArg> {
  where: { id: number };
  include?: TInclude;
}

/** findMany 引数 */
export interface FindManyArgs<
  TWhere,
  TOrderBy = Record<string, OrderByDirection>,
  TInclude extends IncludeArg = IncludeArg,
> {
  where?: TWhere;
  orderBy?: TOrderBy;
  include?: TInclude;
  take?: number;
  skip?: number;
}

/**
 * relation 解決のための minimal な PleasyncClient インターフェース。
 *
 * 生成された PleasyncClient はこれを実装し、ModelCollection に
 * 自身を渡すことで relation include 時に他 collection を引けるようにする。
 */
export interface ClientLike {
  /** logical model name から該当 ModelCollection 風のオブジェクトを返す。 */
  __resolveCollection(name: string): {
    findUnique(args: { where: { id: number } }): Promise<unknown>;
  };
}
