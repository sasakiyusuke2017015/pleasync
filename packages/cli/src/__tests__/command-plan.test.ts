import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlan } from '../command-plan.js';
import type { RawSite } from '../introspect.js';

const SCHEMA_YAML = `
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    siteId: 35535
    title: 顧客マスタ
    fields:
      code: { slot: ClassA, label: 顧客コード, type: text, required: true }
      name: { slot: ClassB, label: 名前, type: text }
`;

const SCHEMA_YAML_NEW = `
version: '1'
models:
  invoice:
    type: Results
    parentId: 35534
    title: 請求書
    fields:
      number: { slot: ClassA, label: 番号, type: text }
`;

describe('runPlan', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'pleasync-plan-test-'));
  });

  it('完全一致の schema → unchanged', async () => {
    await writeFile(join(workDir, 'pleasync.schema.yaml'), SCHEMA_YAML);

    const fetcher = async (siteId: number): Promise<RawSite> => {
      if (siteId !== 35535) throw new Error(`unexpected siteId: ${siteId}`);
      return {
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
      };
    };

    const result = await runPlan({ cwd: workDir, fetchSite: fetcher });

    expect(result.plan.models[0].kind).toBe('unchanged');
    expect(result.text).toMatch(/= customer/);
    expect(result.text).toMatch(/0 to create.*0 to update/);
  });

  it('siteId 未指定の model → create', async () => {
    await writeFile(join(workDir, 'pleasync.schema.yaml'), SCHEMA_YAML_NEW);

    const fetcher = async (): Promise<RawSite> => {
      throw new Error('should not be called when siteId is missing');
    };

    const result = await runPlan({ cwd: workDir, fetchSite: fetcher });

    expect(result.plan.models[0].kind).toBe('create');
    expect(result.text).toMatch(/\+ invoice/);
    expect(result.text).toMatch(/1 to create/);
  });

  it('siteId 指定だが getSite が 404 → create', async () => {
    await writeFile(join(workDir, 'pleasync.schema.yaml'), SCHEMA_YAML);

    const fetcher = async (): Promise<RawSite> => {
      throw new Error('404 Not Found');
    };

    const result = await runPlan({ cwd: workDir, fetchSite: fetcher });
    expect(result.plan.models[0].kind).toBe('create');
  });

  it('label 違い → update', async () => {
    await writeFile(join(workDir, 'pleasync.schema.yaml'), SCHEMA_YAML);

    const fetcher = async (): Promise<RawSite> => ({
      SiteId: 35535,
      Title: '顧客マスタ',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: {
        Columns: [
          { ColumnName: 'ClassA', LabelText: '違うラベル' },
          { ColumnName: 'ClassB', LabelText: '名前' },
        ],
      },
    });

    const result = await runPlan({ cwd: workDir, fetchSite: fetcher });
    expect(result.plan.models[0].kind).toBe('update');
    expect(result.text).toMatch(/~ customer/);
    expect(result.text).toMatch(/update-column-label|column ClassA label/);
  });

  it('schema 不正 → throw', async () => {
    await writeFile(
      join(workDir, 'pleasync.schema.yaml'),
      `
version: '1'
models:
  Customer:
    type: Results
    parentId: 1
    title: A
    fields:
      a: { slot: ClassA, label: a, type: number }
`,
    );

    await expect(
      runPlan({
        cwd: workDir,
        fetchSite: async () => ({}) as RawSite,
      }),
    ).rejects.toThrow(/schema validation failed/);
  });

  it('schema が見つからない → throw', async () => {
    await expect(
      runPlan({ cwd: workDir, fetchSite: async () => ({}) as RawSite }),
    ).rejects.toThrow();
  });
});
