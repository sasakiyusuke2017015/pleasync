import { Engine } from './engine.js';
import { fromApiRecord, toApiPayload } from './transform.js';
import type { FindManyArgs, ModelDef } from './types.js';

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
> {
  protected abstract readonly modelDef: ModelDef;

  constructor(protected readonly engine: Engine) {}

  /** id 1 件取得（見つからなければ null） */
  async findUnique(args: { where: { id: number } }): Promise<TRecord | null> {
    try {
      const raw = await this.engine.api_().getRecord(args.where.id);
      if (raw === null || raw === undefined) return null;
      return fromApiRecord(
        raw as Record<string, unknown>,
        this.modelDef,
      ) as TRecord;
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
  async findMany(args?: FindManyArgs<TWhere>): Promise<TRecord[]> {
    let raw: unknown[];

    if (args?.where || args?.take !== undefined || args?.skip !== undefined) {
      const options = this.buildGetOptions(args);
      raw = await this.engine.api_().getRecordsWithOptions(this.modelDef.siteId, options);
    } else {
      raw = await this.engine.api_().getRecords(this.modelDef.siteId);
    }

    return raw.map((r) =>
      fromApiRecord(r as Record<string, unknown>, this.modelDef),
    ) as TRecord[];
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
   * MVP: where の各 key について equals のみサポート。
   * 例: `where: { code: 'C-001', status: 100 }`
   *   → `ColumnFilterHash: { ClassA: '["C-001"]', Status: '[100]' }`
   */
  protected buildGetOptions(args: FindManyArgs<TWhere>): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    if (args.take !== undefined) {
      options.PageSize = args.take;
    }
    if (args.skip !== undefined) {
      options.Offset = args.skip;
    }

    if (args.where && typeof args.where === 'object') {
      const filterHash: Record<string, string> = {};
      for (const [logical, value] of Object.entries(
        args.where as Record<string, unknown>,
      )) {
        const fieldDef = this.modelDef.fieldMap[logical];
        if (!fieldDef) {
          throw new Error(`unknown field in where: '${logical}'`);
        }
        // MVP: equals only。他の演算子は今後拡張
        filterHash[fieldDef.slot] = JSON.stringify([value]);
      }
      if (Object.keys(filterHash).length > 0) {
        options.ColumnFilterHash = filterHash;
      }
    }

    return options;
  }
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    return /404|not found/i.test(err.message);
  }
  return false;
}
