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
});
