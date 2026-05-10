import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Engine } from '../engine.js';
import { ModelCollection } from '../model-collection.js';
import type { ModelDef, PleasanterApi } from '../types.js';

interface CustomerRecord {
  id: number;
  code: string;
  name: string;
  status: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CustomerCreate extends Record<string, unknown> {
  code: string;
  name: string;
  status?: number;
}

interface CustomerUpdate extends Record<string, unknown> {
  code?: string;
  name?: string;
  status?: number;
}

interface CustomerWhere {
  code?: string;
  status?: number;
}

class CustomerCollection extends ModelCollection<
  CustomerRecord,
  CustomerCreate,
  CustomerUpdate,
  CustomerWhere
> {
  protected readonly modelDef: ModelDef = {
    type: 'Results',
    parentId: 1,
    siteId: 100,
    fieldMap: {
      code: { slot: 'ClassA', type: 'text' },
      name: { slot: 'ClassB', type: 'text' },
      status: { slot: 'Status', type: 'status' },
    },
  };
}

function makeMockApi(): PleasanterApi & {
  getRecord: ReturnType<typeof vi.fn>;
  getRecords: ReturnType<typeof vi.fn>;
  getRecordsWithOptions: ReturnType<typeof vi.fn>;
  createRecord: ReturnType<typeof vi.fn>;
  updateRecord: ReturnType<typeof vi.fn>;
  deleteRecord: ReturnType<typeof vi.fn>;
} {
  return {
    getRecord: vi.fn(),
    getRecords: vi.fn(),
    getRecordsWithOptions: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
  };
}

describe('ModelCollection', () => {
  let api: ReturnType<typeof makeMockApi>;
  let collection: CustomerCollection;

  beforeEach(() => {
    api = makeMockApi();
    collection = new CustomerCollection(Engine.fromApi(api));
  });

  describe('findUnique', () => {
    it('id でレコードを 1 件取得', async () => {
      api.getRecord.mockResolvedValueOnce({
        ResultId: 42,
        ClassHash: { ClassA: 'C-001', ClassB: 'foo' },
        Status: 100,
      });

      const record = await collection.findUnique({ where: { id: 42 } });

      expect(api.getRecord).toHaveBeenCalledWith(42);
      expect(record).toMatchObject({
        id: 42,
        code: 'C-001',
        name: 'foo',
        status: 100,
      });
    });

    it('null 戻り → null', async () => {
      api.getRecord.mockResolvedValueOnce(null);
      const record = await collection.findUnique({ where: { id: 42 } });
      expect(record).toBeNull();
    });

    it('not-found エラーは null として吸収', async () => {
      api.getRecord.mockRejectedValueOnce(new Error('404 Not Found'));
      const record = await collection.findUnique({ where: { id: 42 } });
      expect(record).toBeNull();
    });

    it('それ以外のエラーは throw', async () => {
      api.getRecord.mockRejectedValueOnce(new Error('500 Server Error'));
      await expect(
        collection.findUnique({ where: { id: 42 } }),
      ).rejects.toThrow(/500/);
    });
  });

  describe('findMany', () => {
    it('引数なし → getRecords を呼ぶ', async () => {
      api.getRecords.mockResolvedValueOnce([
        { ResultId: 1, ClassHash: { ClassA: 'A' } },
        { ResultId: 2, ClassHash: { ClassA: 'B' } },
      ]);

      const list = await collection.findMany();

      expect(api.getRecords).toHaveBeenCalledWith(100);
      expect(list).toHaveLength(2);
      expect(list[0].code).toBe('A');
    });

    it('where あり → getRecordsWithOptions と ColumnFilterHash', async () => {
      api.getRecordsWithOptions.mockResolvedValueOnce([]);

      await collection.findMany({ where: { code: 'C-001', status: 100 } });

      expect(api.getRecordsWithOptions).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          ColumnFilterHash: {
            ClassA: '["C-001"]',
            Status: '[100]',
          },
        }),
      );
    });

    it('take/skip → PageSize/Offset', async () => {
      api.getRecordsWithOptions.mockResolvedValueOnce([]);

      await collection.findMany({ take: 10, skip: 20 });

      expect(api.getRecordsWithOptions).toHaveBeenCalledWith(
        100,
        expect.objectContaining({ PageSize: 10, Offset: 20 }),
      );
    });

    it('未定義 field を where に → throw', async () => {
      await expect(
        collection.findMany({
          where: { unknown: 'x' } as never,
        }),
      ).rejects.toThrow(/unknown field/);
    });

    describe('where operators', () => {
      it('リテラル値 → equals 1 件として扱う', async () => {
        api.getRecordsWithOptions.mockResolvedValueOnce([]);
        await collection.findMany({ where: { status: 100 } });
        expect(api.getRecordsWithOptions).toHaveBeenCalledWith(
          100,
          expect.objectContaining({
            ColumnFilterHash: { Status: '[100]' },
          }),
        );
      });

      it('{ equals: T } → 単一値配列', async () => {
        api.getRecordsWithOptions.mockResolvedValueOnce([]);
        await collection.findMany({
          where: { status: { equals: 100 } } as never,
        });
        expect(api.getRecordsWithOptions).toHaveBeenCalledWith(
          100,
          expect.objectContaining({
            ColumnFilterHash: { Status: '[100]' },
          }),
        );
      });

      it('{ in: [T, T, T] } → 複数値配列', async () => {
        api.getRecordsWithOptions.mockResolvedValueOnce([]);
        await collection.findMany({
          where: { status: { in: [100, 200, 900] } } as never,
        });
        expect(api.getRecordsWithOptions).toHaveBeenCalledWith(
          100,
          expect.objectContaining({
            ColumnFilterHash: { Status: '[100,200,900]' },
          }),
        );
      });

      it('equals と in の同時指定 → throw', async () => {
        await expect(
          collection.findMany({
            where: { status: { equals: 100, in: [200] } } as never,
          }),
        ).rejects.toThrow(/both/);
      });

      it('演算子オブジェクト中身が空 → throw', async () => {
        await expect(
          collection.findMany({ where: { status: {} } as never }),
        ).rejects.toThrow(/no recognized operator/);
      });

      it('in が array でない → throw', async () => {
        await expect(
          collection.findMany({
            where: { status: { in: 'not-array' } } as never,
          }),
        ).rejects.toThrow(/must be an array/);
      });

      it('複数 field の AND', async () => {
        api.getRecordsWithOptions.mockResolvedValueOnce([]);
        await collection.findMany({
          where: { code: 'C-001', status: { in: [100, 200] } } as never,
        });
        expect(api.getRecordsWithOptions).toHaveBeenCalledWith(
          100,
          expect.objectContaining({
            ColumnFilterHash: {
              ClassA: '["C-001"]',
              Status: '[100,200]',
            },
          }),
        );
      });

      describe('client-side operators', () => {
        it('not: client-side で除外 (server-side 送信なし)', async () => {
          api.getRecordsWithOptions.mockResolvedValueOnce([
            { ResultId: 1, ClassHash: { ClassA: 'A' }, Status: 100 },
            { ResultId: 2, ClassHash: { ClassA: 'B' }, Status: 200 },
          ]);
          const r = await collection.findMany({
            where: { status: { not: 100 } } as never,
          });
          expect(r).toHaveLength(1);
          expect(r[0].id).toBe(2);
        });

        it('notIn: 配列に含まれないものだけ', async () => {
          api.getRecordsWithOptions.mockResolvedValueOnce([
            { ResultId: 1, Status: 100 },
            { ResultId: 2, Status: 200 },
            { ResultId: 3, Status: 900 },
          ]);
          const r = await collection.findMany({
            where: { status: { notIn: [100, 900] } } as never,
          });
          expect(r).toHaveLength(1);
          expect(r[0].id).toBe(2);
        });

        it('contains: 部分文字列マッチ', async () => {
          api.getRecordsWithOptions.mockResolvedValueOnce([
            { ResultId: 1, ClassHash: { ClassA: 'C-001' } },
            { ResultId: 2, ClassHash: { ClassA: 'X-002' } },
            { ResultId: 3, ClassHash: { ClassA: 'C-003' } },
          ]);
          const r = await collection.findMany({
            where: { code: { contains: 'C-' } } as never,
          });
          expect(r.map((x) => x.id)).toEqual([1, 3]);
        });

        it('startsWith / endsWith', async () => {
          api.getRecordsWithOptions.mockResolvedValueOnce([
            { ResultId: 1, ClassHash: { ClassA: 'foo-bar' } },
            { ResultId: 2, ClassHash: { ClassA: 'baz-foo' } },
          ]);
          let r = await collection.findMany({
            where: { code: { startsWith: 'foo' } } as never,
          });
          expect(r.map((x) => x.id)).toEqual([1]);

          api.getRecordsWithOptions.mockResolvedValueOnce([
            { ResultId: 1, ClassHash: { ClassA: 'foo-bar' } },
            { ResultId: 2, ClassHash: { ClassA: 'baz-foo' } },
          ]);
          r = await collection.findMany({
            where: { code: { endsWith: 'foo' } } as never,
          });
          expect(r.map((x) => x.id)).toEqual([2]);
        });

        it('gt / gte / lt / lte (number)', async () => {
          const data = [
            { ResultId: 1, Status: 100 },
            { ResultId: 2, Status: 200 },
            { ResultId: 3, Status: 300 },
          ];

          api.getRecordsWithOptions.mockResolvedValueOnce(data);
          let r = await collection.findMany({
            where: { status: { gt: 100 } } as never,
          });
          expect(r.map((x) => x.id)).toEqual([2, 3]);

          api.getRecordsWithOptions.mockResolvedValueOnce(data);
          r = await collection.findMany({
            where: { status: { gte: 200 } } as never,
          });
          expect(r.map((x) => x.id)).toEqual([2, 3]);

          api.getRecordsWithOptions.mockResolvedValueOnce(data);
          r = await collection.findMany({
            where: { status: { lt: 200 } } as never,
          });
          expect(r.map((x) => x.id)).toEqual([1]);

          api.getRecordsWithOptions.mockResolvedValueOnce(data);
          r = await collection.findMany({
            where: { status: { lte: 200 } } as never,
          });
          expect(r.map((x) => x.id)).toEqual([1, 2]);
        });

        it('client-side filter + take/skip は filter 後の slice', async () => {
          api.getRecordsWithOptions.mockResolvedValueOnce([
            { ResultId: 1, ClassHash: { ClassA: 'C-001' } },
            { ResultId: 2, ClassHash: { ClassA: 'X-002' } },
            { ResultId: 3, ClassHash: { ClassA: 'C-003' } },
            { ResultId: 4, ClassHash: { ClassA: 'C-004' } },
          ]);
          const r = await collection.findMany({
            where: { code: { contains: 'C-' } },
            take: 2,
            skip: 1,
          } as never);
          // contains 'C-' で 1, 3, 4 → skip 1 → [3, 4] → take 2 → [3, 4]
          expect(r.map((x) => x.id)).toEqual([3, 4]);
        });

        it('client-side filter があるとき server に take/skip を送らない', async () => {
          api.getRecordsWithOptions.mockResolvedValueOnce([]);
          await collection.findMany({
            where: { code: { contains: 'X' } },
            take: 5,
            skip: 2,
          } as never);
          const opts = api.getRecordsWithOptions.mock.calls[0][1] as Record<string, unknown>;
          expect(opts.PageSize).toBeUndefined();
          expect(opts.Offset).toBeUndefined();
        });

        it('server (equals) + client (contains) を AND で組み合わせ', async () => {
          api.getRecordsWithOptions.mockResolvedValueOnce([
            { ResultId: 1, ClassHash: { ClassA: 'C-001' }, Status: 100 },
            { ResultId: 2, ClassHash: { ClassA: 'X-002' }, Status: 100 },
            { ResultId: 3, ClassHash: { ClassA: 'C-003' }, Status: 100 },
          ]);
          const r = await collection.findMany({
            where: {
              status: 100,
              code: { contains: 'C-' },
            },
          } as never);
          // server で status=100 (3 件全部返ってくる想定) + client で code に C- を含むもの
          expect(r.map((x) => x.id)).toEqual([1, 3]);

          // server には status=100 の filter のみ送られる
          const opts = api.getRecordsWithOptions.mock.calls[0][1] as Record<string, unknown>;
          expect(opts.ColumnFilterHash).toEqual({ Status: '[100]' });
        });
      });
    });

    describe('orderBy', () => {
      it('asc/desc を ColumnSorterHash にマップ', async () => {
        api.getRecordsWithOptions.mockResolvedValueOnce([]);
        await collection.findMany({
          orderBy: { code: 'asc', status: 'desc' } as never,
        });
        expect(api.getRecordsWithOptions).toHaveBeenCalledWith(
          100,
          expect.objectContaining({
            ColumnSorterHash: { ClassA: 'asc', Status: 'desc' },
          }),
        );
      });

      it('未定義 field を orderBy に → throw', async () => {
        await expect(
          collection.findMany({
            orderBy: { unknown: 'asc' } as never,
          }),
        ).rejects.toThrow(/unknown field in orderBy/);
      });

      it('asc/desc 以外の direction → throw', async () => {
        await expect(
          collection.findMany({
            orderBy: { code: 'sideways' } as never,
          }),
        ).rejects.toThrow(/asc.*desc/);
      });

      it('where と orderBy 同時', async () => {
        api.getRecordsWithOptions.mockResolvedValueOnce([]);
        await collection.findMany({
          where: { status: 100 },
          orderBy: { code: 'asc' } as never,
        });
        const call = api.getRecordsWithOptions.mock.calls[0][1] as Record<string, unknown>;
        expect(call.ColumnFilterHash).toEqual({ Status: '[100]' });
        expect(call.ColumnSorterHash).toEqual({ ClassA: 'asc' });
      });
    });
  });

  describe('create', () => {
    it('payload を変換して createRecord を呼ぶ', async () => {
      api.createRecord.mockResolvedValueOnce(99);
      api.getRecord.mockResolvedValueOnce({
        ResultId: 99,
        ClassHash: { ClassA: 'C-001', ClassB: 'foo' },
        Status: 100,
      });

      const created = await collection.create({
        data: { code: 'C-001', name: 'foo', status: 100 },
      });

      expect(api.createRecord).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          ClassHash: { ClassA: 'C-001', ClassB: 'foo' },
          Status: 100,
        }),
      );
      expect(created.id).toBe(99);
      expect(created.code).toBe('C-001');
    });

    it('作成後の re-fetch で null → throw', async () => {
      api.createRecord.mockResolvedValueOnce(99);
      api.getRecord.mockResolvedValueOnce(null);

      await expect(
        collection.create({ data: { code: 'C-001', name: 'foo' } }),
      ).rejects.toThrow(/could not be re-fetched/);
    });
  });

  describe('update', () => {
    it('payload を変換して updateRecord を呼ぶ', async () => {
      api.updateRecord.mockResolvedValueOnce(undefined);

      await collection.update({
        where: { id: 99 },
        data: { name: 'updated' },
      });

      expect(api.updateRecord).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          ClassHash: { ClassB: 'updated' },
        }),
      );
    });

    it('未定義 field → throw', async () => {
      await expect(
        collection.update({
          where: { id: 1 },
          data: { unknown: 'x' } as never,
        }),
      ).rejects.toThrow(/unknown field/);
    });
  });

  describe('delete', () => {
    it('deleteRecord を呼ぶ', async () => {
      api.deleteRecord.mockResolvedValueOnce(undefined);
      await collection.delete({ where: { id: 99 } });
      expect(api.deleteRecord).toHaveBeenCalledWith(99);
    });
  });

  describe('relation include', () => {
    interface InvoiceRecord {
      id: number;
      customerId: number | { id: number; code: string };
      amount: number;
    }
    type InvoiceCreate = { customerId: number; amount: number };
    type InvoiceUpdate = Partial<InvoiceCreate>;
    interface InvoiceWhere {
      customerId?: number;
    }

    class InvoiceCollection extends ModelCollection<
      InvoiceRecord,
      InvoiceCreate,
      InvoiceUpdate,
      InvoiceWhere
    > {
      protected readonly modelDef = {
        type: 'Results' as const,
        parentId: 1,
        siteId: 200,
        fieldMap: {
          customerId: {
            slot: 'ClassA',
            type: 'relation' as const,
            targetModel: 'customer',
          },
          amount: { slot: 'NumA', type: 'number' as const },
        },
      };
    }

    it('include を呼ぶと client.__resolveCollection 経由で関連 record が populate される', async () => {
      const customerCollection = {
        findUnique: vi.fn().mockResolvedValue({ id: 7, code: 'C-007' }),
      };

      const fakeClient = {
        __resolveCollection: vi
          .fn()
          .mockReturnValue(customerCollection),
      };

      api.getRecord.mockResolvedValueOnce({
        ResultId: 1,
        ClassHash: { ClassA: 7 },
        NumHash: { NumA: 1000 },
      });

      const invoices = new InvoiceCollection(Engine.fromApi(api), fakeClient);

      const result = await invoices.findUnique({
        where: { id: 1 },
        include: { customerId: true },
      });

      expect(fakeClient.__resolveCollection).toHaveBeenCalledWith('customer');
      expect(customerCollection.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
      });
      expect(result?.customerId).toEqual({ id: 7, code: 'C-007' });
    });

    it('findMany + include で同じ id は 1 回だけ fetch される (重複排除)', async () => {
      const customerCollection = {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: number } }) =>
          Promise.resolve({ id: where.id, code: `C-${where.id}` }),
        ),
      };
      const fakeClient = {
        __resolveCollection: vi.fn().mockReturnValue(customerCollection),
      };

      api.getRecords.mockResolvedValueOnce([
        { ResultId: 1, ClassHash: { ClassA: 7 } },
        { ResultId: 2, ClassHash: { ClassA: 7 } }, // 同じ customer
        { ResultId: 3, ClassHash: { ClassA: 8 } }, // 別 customer
      ]);

      const invoices = new InvoiceCollection(Engine.fromApi(api), fakeClient);
      const result = await invoices.findMany({ include: { customerId: true } });

      // findUnique は customer 7 と 8 で 2 回だけ
      expect(customerCollection.findUnique).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(3);
      expect(result[0].customerId).toEqual({ id: 7, code: 'C-7' });
      expect(result[1].customerId).toEqual({ id: 7, code: 'C-7' });
      expect(result[2].customerId).toEqual({ id: 8, code: 'C-8' });
    });

    it('include 指定なしなら client は呼ばれない', async () => {
      const fakeClient = {
        __resolveCollection: vi.fn(),
      };

      api.getRecord.mockResolvedValueOnce({
        ResultId: 1,
        ClassHash: { ClassA: 7 },
      });

      const invoices = new InvoiceCollection(Engine.fromApi(api), fakeClient);
      await invoices.findUnique({ where: { id: 1 } });

      expect(fakeClient.__resolveCollection).not.toHaveBeenCalled();
    });

    it('client 無しで include 指定 → throw', async () => {
      api.getRecord.mockResolvedValueOnce({
        ResultId: 1,
        ClassHash: { ClassA: 7 },
      });

      const invoices = new InvoiceCollection(Engine.fromApi(api));

      await expect(
        invoices.findUnique({
          where: { id: 1 },
          include: { customerId: true },
        }),
      ).rejects.toThrow(/no client reference/);
    });

    it('include の対象が relation field でない → throw', async () => {
      const fakeClient = {
        __resolveCollection: vi.fn(),
      };

      api.getRecord.mockResolvedValueOnce({
        ResultId: 1,
        ClassHash: { ClassA: 7 },
        NumHash: { NumA: 1000 },
      });

      const invoices = new InvoiceCollection(Engine.fromApi(api), fakeClient);

      await expect(
        invoices.findUnique({
          where: { id: 1 },
          include: { amount: true } as never,
        }),
      ).rejects.toThrow(/not a relation field/);
    });

    it('include: false なら fetch しない', async () => {
      const customerCollection = {
        findUnique: vi.fn(),
      };
      const fakeClient = {
        __resolveCollection: vi.fn().mockReturnValue(customerCollection),
      };

      api.getRecord.mockResolvedValueOnce({
        ResultId: 1,
        ClassHash: { ClassA: 7 },
      });

      const invoices = new InvoiceCollection(Engine.fromApi(api), fakeClient);
      const result = await invoices.findUnique({
        where: { id: 1 },
        include: { customerId: false },
      });

      expect(customerCollection.findUnique).not.toHaveBeenCalled();
      expect(result?.customerId).toBe(7); // FK のまま
    });
  });
});
