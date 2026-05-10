import { Engine } from './engine.js';
import { fromApiRecord, toApiPayload } from './transform.js';
import type {
  ClientLike,
  FindManyArgs,
  FindUniqueArgs,
  IncludeArg,
  ModelDef,
  OrderByDirection,
} from './types.js';

/**
 * 1 model に対する CRUD を提供する基底クラス。
 *
 * codegen で各 model 用のサブクラスを生成し、`modelDef` を埋め込む。
 *
 * 型パラメータ:
 * - TRecord: read 時のレコード型 (`{ id, ...fields, createdAt, updatedAt }`)
 * - TCreate: create 時の入力型
 * - TUpdate: update 時の入力型 (Partial)
 * - TWhere: findMany の where 句型
 */
export abstract class ModelCollection<
  TRecord,
  TCreate extends Record<string, unknown>,
  TUpdate extends Record<string, unknown>,
  TWhere,
  TOrderBy = Record<string, OrderByDirection>,
  TInclude extends IncludeArg = IncludeArg,
> {
  protected abstract readonly modelDef: ModelDef;

  constructor(
    protected readonly engine: Engine,
    /**
     * relation include 解決用の client 参照。生成された PleasyncClient が自身を渡す。
     * include を使わない場合は省略可（テスト等）。
     */
    protected readonly client?: ClientLike,
  ) {}

  /** id 1 件取得（見つからなければ null） */
  async findUnique(args: FindUniqueArgs<TInclude>): Promise<TRecord | null> {
    try {
      const raw = await this.engine.api_().getRecord(args.where.id);
      if (raw === null || raw === undefined) return null;
      const record = fromApiRecord(
        raw as Record<string, unknown>,
        this.modelDef,
      );
      if (args.include) {
        await this.resolveIncludes([record], args.include);
      }
      return record as TRecord;
    } catch (err) {
      // Pleasanter API は 404 を error で返す可能性あり
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  /**
   * 全件 / 条件付き取得。
   *
   * 現状の MVP では where は equals のみ（API 側のフィルタを信頼）。
   * 高度な演算子は後続フェーズで `getRecordsWithOptions` の ColumnFilterHash に
   * マップする実装に拡張予定。
   */
  async findMany(
    args?: FindManyArgs<TWhere, TOrderBy, TInclude>,
  ): Promise<TRecord[]> {
    let raw: unknown[];

    const hasOptions =
      args !== undefined &&
      (args.where !== undefined ||
        args.orderBy !== undefined ||
        args.take !== undefined ||
        args.skip !== undefined);

    if (hasOptions) {
      const options = this.buildGetOptions(args);
      raw = await this.engine
        .api_()
        .getRecordsWithOptions(this.modelDef.siteId, options);
    } else {
      raw = await this.engine.api_().getRecords(this.modelDef.siteId);
    }

    const records = raw.map((r) =>
      fromApiRecord(r as Record<string, unknown>, this.modelDef),
    );

    if (args?.include) {
      await this.resolveIncludes(records, args.include);
    }

    return records as TRecord[];
  }

  /**
   * include 句に応じて関連レコードを populate する。
   *
   * MVP: forward relation のみサポート（このモデルが foreign key を持つケース）。
   * inverse relation (1:N) は将来対応。
   *
   * 実装は N+1 fetch（findUnique を foreign key 数回呼ぶ）。
   * 同じ id への重複呼び出しは内部でキャッシュして 1 回にまとめる。
   */
  protected async resolveIncludes(
    records: ReadonlyArray<Record<string, unknown>>,
    include: IncludeArg,
  ): Promise<void> {
    if (!this.client) {
      throw new Error(
        "include is requested but no client reference was provided to ModelCollection. " +
          "If you constructed this collection directly, pass `client` as the second arg.",
      );
    }

    for (const [logical, enabled] of Object.entries(include)) {
      if (!enabled) continue;

      const fieldDef = this.modelDef.fieldMap[logical];
      if (!fieldDef || fieldDef.type !== 'relation') {
        throw new Error(
          `include: '${logical}' is not a relation field on this model`,
        );
      }
      const target = fieldDef.targetModel;
      if (!target) {
        throw new Error(
          `relation field '${logical}' has no targetModel; check codegen output`,
        );
      }

      const targetCollection = this.client.__resolveCollection(target);

      // ユニークな foreign key id を集める
      const idsToFetch = new Set<number>();
      for (const r of records) {
        const fk = r[logical];
        if (typeof fk === 'number' && fk > 0) {
          idsToFetch.add(fk);
        }
      }

      // 1 回ずつ fetch して id → record の map を作る
      const cache = new Map<number, unknown>();
      for (const id of idsToFetch) {
        const found = await targetCollection.findUnique({ where: { id } });
        if (found !== null && found !== undefined) {
          cache.set(id, found);
        }
      }

      // 各 record に populate
      for (const r of records) {
        const fk = r[logical];
        if (typeof fk === 'number' && cache.has(fk)) {
          r[logical] = cache.get(fk);
        }
      }
    }
  }

  /** 新規作成 → 作成された record を返す */
  async create(args: { data: TCreate }): Promise<TRecord> {
    const payload = toApiPayload(args.data, this.modelDef);
    const newId = await this.engine.api_().createRecord(this.modelDef.siteId, payload);
    const created = await this.findUnique({ where: { id: newId } });
    if (created === null) {
      throw new Error(
        `created record (id=${newId}) could not be re-fetched`,
      );
    }
    return created;
  }

  /** 更新（id 必須）。戻り値は void。再取得したい場合は別途 findUnique */
  async update(args: { where: { id: number }; data: TUpdate }): Promise<void> {
    const payload = toApiPayload(args.data, this.modelDef);
    await this.engine.api_().updateRecord(args.where.id, payload);
  }

  /** 削除 */
  async delete(args: { where: { id: number } }): Promise<void> {
    await this.engine.api_().deleteRecord(args.where.id);
  }

  /**
   * findMany の args から Pleasanter `getRecordsWithOptions` 用 options を組み立てる。
   *
   * - where 句:
   *   - リテラル値: `{ status: 100 }` → equals 100
   *   - `{ equals: T }`: 同上
   *   - `{ in: [T] }`: IN 句
   *   - 複数の operator 同時指定はエラー
   * - orderBy: `{ field: 'asc' | 'desc' }` を ColumnSorterHash にマップ
   * - take/skip: PageSize/Offset
   */
  protected buildGetOptions(
    args: FindManyArgs<TWhere, TOrderBy>,
  ): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    if (args.take !== undefined) {
      options.PageSize = args.take;
    }
    if (args.skip !== undefined) {
      options.Offset = args.skip;
    }

    if (args.where && typeof args.where === 'object') {
      const filterHash = this.buildFilterHash(
        args.where as Record<string, unknown>,
      );
      if (Object.keys(filterHash).length > 0) {
        options.ColumnFilterHash = filterHash;
      }
    }

    if (args.orderBy && typeof args.orderBy === 'object') {
      const sorterHash = this.buildSorterHash(
        args.orderBy as Record<string, OrderByDirection>,
      );
      if (Object.keys(sorterHash).length > 0) {
        options.ColumnSorterHash = sorterHash;
      }
    }

    return options;
  }

  private buildFilterHash(
    where: Record<string, unknown>,
  ): Record<string, string> {
    const filterHash: Record<string, string> = {};
    for (const [logical, raw] of Object.entries(where)) {
      const fieldDef = this.modelDef.fieldMap[logical];
      if (!fieldDef) {
        throw new Error(`unknown field in where: '${logical}'`);
      }
      filterHash[fieldDef.slot] = encodeWhereValue(raw, logical);
    }
    return filterHash;
  }

  private buildSorterHash(
    orderBy: Record<string, OrderByDirection>,
  ): Record<string, OrderByDirection> {
    const sorterHash: Record<string, OrderByDirection> = {};
    for (const [logical, direction] of Object.entries(orderBy)) {
      const fieldDef = this.modelDef.fieldMap[logical];
      if (!fieldDef) {
        throw new Error(`unknown field in orderBy: '${logical}'`);
      }
      if (direction !== 'asc' && direction !== 'desc') {
        throw new Error(
          `invalid orderBy direction for '${logical}': must be 'asc' or 'desc'`,
        );
      }
      sorterHash[fieldDef.slot] = direction;
    }
    return sorterHash;
  }
}

function encodeWhereValue(value: unknown, fieldName: string): string {
  // リテラル primitive → equals 1 件
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify([value]);
  }

  if (typeof value !== 'object') {
    throw new Error(`invalid where value for '${fieldName}': ${typeof value}`);
  }

  const op = value as { equals?: unknown; in?: readonly unknown[] };
  const hasEquals = 'equals' in op && op.equals !== undefined;
  const hasIn = 'in' in op && op.in !== undefined;

  if (hasEquals && hasIn) {
    throw new Error(
      `where '${fieldName}' has both 'equals' and 'in' (specify only one)`,
    );
  }

  if (hasEquals) {
    return JSON.stringify([op.equals]);
  }

  if (hasIn) {
    if (!Array.isArray(op.in)) {
      throw new Error(`where '${fieldName}.in' must be an array`);
    }
    return JSON.stringify(op.in);
  }

  throw new Error(
    `where '${fieldName}' has no recognized operator (equals/in)`,
  );
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    return /404|not found/i.test(err.message);
  }
  return false;
}
