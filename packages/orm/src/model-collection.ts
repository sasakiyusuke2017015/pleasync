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
    const where = (args?.where ?? null) as Record<string, unknown> | null;
    const filterOps = where ? this.buildFilterOps(where) : [];
    const hasClientFilter = filterOps.some((op) => op.clientPredicates.length > 0);

    let raw: unknown[];

    const hasOptions =
      args !== undefined &&
      (args.where !== undefined ||
        args.orderBy !== undefined ||
        args.take !== undefined ||
        args.skip !== undefined);

    if (hasOptions) {
      // client-side filter があるときは take/skip をサーバーに送らない
      // (フィルタ後に JS 側で再 paginate する)
      const argsForServer: FindManyArgs<TWhere, TOrderBy, TInclude> = hasClientFilter
        ? { ...args, take: undefined, skip: undefined }
        : args;
      const options = this.buildGetOptions(argsForServer, filterOps);
      raw = await this.engine
        .api_()
        .getRecordsWithOptions(this.modelDef.siteId, options);
    } else {
      raw = await this.engine.api_().getRecords(this.modelDef.siteId);
    }

    let records = raw.map((r) =>
      fromApiRecord(r as Record<string, unknown>, this.modelDef),
    );

    // client-side filter
    if (hasClientFilter) {
      records = records.filter((r) =>
        filterOps.every((op) =>
          op.clientPredicates.every((pred) => pred(r)),
        ),
      );

      // take/skip を JS 側で再適用
      if (args?.skip !== undefined) {
        records = records.slice(args.skip);
      }
      if (args?.take !== undefined) {
        records = records.slice(0, args.take);
      }
    }

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
    filterOps?: FilterOp[],
  ): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    if (args.take !== undefined) {
      options.PageSize = args.take;
    }
    if (args.skip !== undefined) {
      options.Offset = args.skip;
    }

    const ops =
      filterOps ??
      (args.where && typeof args.where === 'object'
        ? this.buildFilterOps(args.where as Record<string, unknown>)
        : []);

    if (ops.length > 0) {
      const filterHash: Record<string, string> = {};
      for (const op of ops) {
        if (op.serverArray !== null) {
          filterHash[op.fieldDef.slot] = JSON.stringify(op.serverArray);
        }
      }
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

  /** where から server / client 両方の filter ops を構築 */
  protected buildFilterOps(where: Record<string, unknown>): FilterOp[] {
    const ops: FilterOp[] = [];
    for (const [logical, raw] of Object.entries(where)) {
      const fieldDef = this.modelDef.fieldMap[logical];
      if (!fieldDef) {
        throw new Error(`unknown field in where: '${logical}'`);
      }
      ops.push(classifyWhereValue(logical, fieldDef, raw));
    }
    return ops;
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

/** 1 field の filter operation。server/client 両方を保持。 */
interface FilterOp {
  fieldDef: { slot: string; type: string };
  /** ColumnFilterHash 用の値（JSON 配列）。client-side のみなら null */
  serverArray: readonly unknown[] | null;
  /** record に適用する predicate 群 */
  clientPredicates: Array<(record: Record<string, unknown>) => boolean>;
}

interface FilterOpInput {
  equals?: unknown;
  in?: readonly unknown[];
  not?: unknown;
  notIn?: readonly unknown[];
  contains?: unknown;
  startsWith?: unknown;
  endsWith?: unknown;
  gt?: unknown;
  gte?: unknown;
  lt?: unknown;
  lte?: unknown;
}

function classifyWhereValue(
  logicalName: string,
  fieldDef: { slot: string; type: string },
  value: unknown,
): FilterOp {
  // リテラル primitive → equals 略記 → server-side
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return {
      fieldDef,
      serverArray: [value],
      clientPredicates: [],
    };
  }

  if (typeof value !== 'object') {
    throw new Error(`invalid where value for '${logicalName}': ${typeof value}`);
  }

  const op = value as FilterOpInput;

  // server-side ops: equals / in
  let serverArray: readonly unknown[] | null = null;
  const hasEquals = 'equals' in op && op.equals !== undefined;
  const hasIn = 'in' in op && op.in !== undefined;

  if (hasEquals && hasIn) {
    throw new Error(
      `where '${logicalName}' has both 'equals' and 'in' (specify only one)`,
    );
  }
  if (hasEquals) {
    serverArray = [op.equals];
  } else if (hasIn) {
    if (!Array.isArray(op.in)) {
      throw new Error(`where '${logicalName}.in' must be an array`);
    }
    serverArray = op.in;
  }

  const clientPredicates: FilterOp['clientPredicates'] = [];

  // client-side: not / notIn / contains / startsWith / endsWith / gt / gte / lt / lte
  if ('not' in op && op.not !== undefined) {
    const target = op.not;
    clientPredicates.push((r) => !sameValue(r[logicalName], target));
  }
  if ('notIn' in op && op.notIn !== undefined) {
    if (!Array.isArray(op.notIn)) {
      throw new Error(`where '${logicalName}.notIn' must be an array`);
    }
    const targets = op.notIn;
    clientPredicates.push((r) => !targets.some((t) => sameValue(r[logicalName], t)));
  }
  if ('contains' in op && op.contains !== undefined) {
    const sub = String(op.contains);
    clientPredicates.push((r) => stringOf(r[logicalName]).includes(sub));
  }
  if ('startsWith' in op && op.startsWith !== undefined) {
    const sub = String(op.startsWith);
    clientPredicates.push((r) => stringOf(r[logicalName]).startsWith(sub));
  }
  if ('endsWith' in op && op.endsWith !== undefined) {
    const sub = String(op.endsWith);
    clientPredicates.push((r) => stringOf(r[logicalName]).endsWith(sub));
  }
  if ('gt' in op && op.gt !== undefined) {
    const t = op.gt;
    clientPredicates.push((r) => compareValues(r[logicalName], t) > 0);
  }
  if ('gte' in op && op.gte !== undefined) {
    const t = op.gte;
    clientPredicates.push((r) => compareValues(r[logicalName], t) >= 0);
  }
  if ('lt' in op && op.lt !== undefined) {
    const t = op.lt;
    clientPredicates.push((r) => compareValues(r[logicalName], t) < 0);
  }
  if ('lte' in op && op.lte !== undefined) {
    const t = op.lte;
    clientPredicates.push((r) => compareValues(r[logicalName], t) <= 0);
  }

  if (serverArray === null && clientPredicates.length === 0) {
    throw new Error(
      `where '${logicalName}' has no recognized operator`,
    );
  }

  return { fieldDef, serverArray, clientPredicates };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function stringOf(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function compareValues(a: unknown, b: unknown): number {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === 'string' && typeof b === 'string' && (isIsoDate(a) || isIsoDate(b))) {
    const da = Date.parse(a);
    const db = Date.parse(b);
    if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  // 型不一致 → 比較失敗扱い (false にする)
  return 0;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(s);
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    return /404|not found/i.test(err.message);
  }
  return false;
}
