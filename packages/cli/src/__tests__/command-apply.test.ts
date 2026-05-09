import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runApply } from '../command-apply.js';
import type { PleasanterApi } from '@pleasync/orm';
import type { RawSite } from '../introspect.js';

const SCHEMA_NEW = `
version: '1'
models:
  invoice:
    type: Results
    parentId: 35534
    title: 請求書
    fields:
      number: { slot: ClassA, label: 番号, type: text, required: true }
      total:  { slot: NumA, label: 金額, type: number }
`;

const SCHEMA_EXISTING_TITLE_DIFF = `
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    siteId: 35535
    title: 顧客マスタ v2
    fields:
      code: { slot: ClassA, label: 顧客コード, type: text }
      name: { slot: ClassB, label: 名前, type: text }
`;

const SCHEMA_LABEL_DIFF = `
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    siteId: 35535
    title: 顧客マスタ
    fields:
      code: { slot: ClassA, label: 新コード, type: text }
      name: { slot: ClassB, label: 名前, type: text }
`;

function makeMockApi(): PleasanterApi & {
  getSite: ReturnType<typeof vi.fn>;
  createSite: ReturnType<typeof vi.fn>;
  updateSite: ReturnType<typeof vi.fn>;
  deleteSite: ReturnType<typeof vi.fn>;
  getRecord: ReturnType<typeof vi.fn>;
  getRecords: ReturnType<typeof vi.fn>;
  getRecordsWithOptions: ReturnType<typeof vi.fn>;
  createRecord: ReturnType<typeof vi.fn>;
  updateRecord: ReturnType<typeof vi.fn>;
  deleteRecord: ReturnType<typeof vi.fn>;
} {
  return {
    getSite: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
    getRecord: vi.fn(),
    getRecords: vi.fn(),
    getRecordsWithOptions: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
  };
}

describe('runApply', () => {
  let workDir: string;
  let api: ReturnType<typeof makeMockApi>;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'pleasync-apply-test-'));
    api = makeMockApi();
  });

  describe('create', () => {
    it('siteId 未指定の model → createSite + updateSite で columns 反映', async () => {
      await writeFile(join(workDir, 'pleasync.schema.yaml'), SCHEMA_NEW);
      api.createSite.mockResolvedValueOnce(99999);
      api.updateSite.mockResolvedValueOnce(undefined);

      const result = await runApply({
        cwd: workDir,
        api,
        fetchSite: async () => {
          throw new Error('should not fetch (no siteId)');
        },
      });

      expect(api.createSite).toHaveBeenCalledWith(
        35534,
        expect.objectContaining({
          Title: '請求書',
          ReferenceType: 'Results',
        }),
      );
      expect(api.updateSite).toHaveBeenCalledWith(
        99999,
        expect.objectContaining({
          SiteSettings: expect.objectContaining({
            Columns: expect.arrayContaining([
              expect.objectContaining({ ColumnName: 'ClassA', LabelText: '番号' }),
              expect.objectContaining({ ColumnName: 'NumA', LabelText: '金額' }),
            ]),
          }),
        }),
      );
      expect(result.created).toEqual([{ modelName: 'invoice', newSiteId: 99999 }]);
    });

    it('schema YAML に新 siteId が書き戻される', async () => {
      const schemaPath = join(workDir, 'pleasync.schema.yaml');
      await writeFile(schemaPath, SCHEMA_NEW);
      api.createSite.mockResolvedValueOnce(42);
      api.updateSite.mockResolvedValueOnce(undefined);

      await runApply({ cwd: workDir, api });

      const updated = await readFile(schemaPath, 'utf-8');
      expect(updated).toMatch(/siteId:\s*42/);
    });

    it('--skip-schema-writeback で書き戻し抑止', async () => {
      const schemaPath = join(workDir, 'pleasync.schema.yaml');
      await writeFile(schemaPath, SCHEMA_NEW);
      api.createSite.mockResolvedValueOnce(42);
      api.updateSite.mockResolvedValueOnce(undefined);

      await runApply({ cwd: workDir, api, skipSchemaWriteback: true });

      const stillOriginal = await readFile(schemaPath, 'utf-8');
      expect(stillOriginal).not.toMatch(/siteId:\s*42/);
    });

    it('fields 無しの model なら updateSite は呼ばない', async () => {
      await writeFile(
        join(workDir, 'pleasync.schema.yaml'),
        `
version: '1'
models:
  m:
    type: Results
    parentId: 1
    title: M
    fields: {}
`,
      );
      api.createSite.mockResolvedValueOnce(7);

      await runApply({ cwd: workDir, api });

      expect(api.createSite).toHaveBeenCalledTimes(1);
      expect(api.updateSite).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('title 変更のみ → updateSite に Title だけ', async () => {
      await writeFile(
        join(workDir, 'pleasync.schema.yaml'),
        SCHEMA_EXISTING_TITLE_DIFF,
      );

      const fetcher = async (): Promise<RawSite> => ({
        SiteId: 35535,
        Title: '顧客マスタ',
        ReferenceType: 'Results',
        ParentId: 35534,
        SiteSettings: {
          Columns: [
            { ColumnName: 'ClassA', LabelText: '顧客コード' },
            { ColumnName: 'ClassB', LabelText: '名前' },
          ],
        },
      });

      api.updateSite.mockResolvedValueOnce(undefined);

      await runApply({ cwd: workDir, api, fetchSite: fetcher });

      expect(api.updateSite).toHaveBeenCalledWith(
        35535,
        expect.objectContaining({ Title: '顧客マスタ v2' }),
      );
      // Title だけ → SiteSettings は含まれない
      const call = api.updateSite.mock.calls[0][1] as Record<string, unknown>;
      expect(call.SiteSettings).toBeUndefined();
    });

    it('label 変更 → 既存 Columns を保持しつつ該当 slot の label のみ更新', async () => {
      await writeFile(
        join(workDir, 'pleasync.schema.yaml'),
        SCHEMA_LABEL_DIFF,
      );

      const fetcher = async (): Promise<RawSite> => ({
        SiteId: 35535,
        Title: '顧客マスタ',
        ReferenceType: 'Results',
        ParentId: 35534,
        SiteSettings: {
          Columns: [
            { ColumnName: 'ClassA', LabelText: '顧客コード' },
            { ColumnName: 'ClassB', LabelText: '名前' },
            { ColumnName: 'ClassZ', LabelText: '別物' }, // orphan, 残すべき
          ],
        },
      });

      api.updateSite.mockResolvedValueOnce(undefined);

      await runApply({ cwd: workDir, api, fetchSite: fetcher });

      const payload = api.updateSite.mock.calls[0][1] as {
        SiteSettings: { Columns: Array<{ ColumnName: string; LabelText?: string }> };
      };
      const columns = payload.SiteSettings.Columns;

      // ClassA は new label
      const classA = columns.find((c) => c.ColumnName === 'ClassA');
      expect(classA?.LabelText).toBe('新コード');

      // ClassB は据え置き
      const classB = columns.find((c) => c.ColumnName === 'ClassB');
      expect(classB?.LabelText).toBe('名前');

      // 既存 ClassZ (orphan) は保持される
      const classZ = columns.find((c) => c.ColumnName === 'ClassZ');
      expect(classZ).toBeDefined();
      expect(classZ?.LabelText).toBe('別物');
    });

    it('add-column → 既存 Columns に append', async () => {
      await writeFile(
        join(workDir, 'pleasync.schema.yaml'),
        `
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      a: { slot: ClassA, label: A, type: text }
      b: { slot: ClassB, label: B, type: text }
`,
      );

      const fetcher = async (): Promise<RawSite> => ({
        SiteId: 100,
        Title: 'M',
        ReferenceType: 'Results',
        ParentId: 1,
        SiteSettings: {
          Columns: [{ ColumnName: 'ClassA', LabelText: 'A' }],
        },
      });

      api.updateSite.mockResolvedValueOnce(undefined);

      await runApply({ cwd: workDir, api, fetchSite: fetcher });

      const payload = api.updateSite.mock.calls[0][1] as {
        SiteSettings: { Columns: Array<{ ColumnName: string }> };
      };
      const slots = payload.SiteSettings.Columns.map((c) => c.ColumnName);
      expect(slots).toContain('ClassA');
      expect(slots).toContain('ClassB');
    });
  });

  describe('unchanged', () => {
    it('完全一致なら createSite/updateSite どちらも呼ばない', async () => {
      await writeFile(
        join(workDir, 'pleasync.schema.yaml'),
        `
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      a: { slot: ClassA, label: A, type: text }
`,
      );

      const fetcher = async (): Promise<RawSite> => ({
        SiteId: 100,
        Title: 'M',
        ReferenceType: 'Results',
        ParentId: 1,
        SiteSettings: {
          Columns: [{ ColumnName: 'ClassA', LabelText: 'A' }],
        },
      });

      const result = await runApply({ cwd: workDir, api, fetchSite: fetcher });

      expect(api.createSite).not.toHaveBeenCalled();
      expect(api.updateSite).not.toHaveBeenCalled();
      expect(result.unchanged).toEqual([{ modelName: 'customer', siteId: 100 }]);
    });
  });
});
