import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runIntrospect, serializeSchema } from '../command-introspect.js';
import type { RawSite } from '../introspect.js';

const SAMPLE_SITES: Record<number, RawSite> = {
  35535: {
    SiteId: 35535,
    Title: 'Customer',
    ReferenceType: 'Results',
    ParentId: 35534,
    SiteSettings: {
      Columns: [
        { ColumnName: 'ClassA', LabelText: '顧客コード' },
        { ColumnName: 'ClassB', LabelText: '名前' },
        {
          ColumnName: 'Status',
          LabelText: '状況',
          ChoicesText: '100,新規\n900,完了',
        },
      ],
    },
  },
  35536: {
    SiteId: 35536,
    Title: 'Issue',
    ReferenceType: 'Issues',
    ParentId: 35534,
    SiteSettings: {
      Columns: [
        { ColumnName: 'ClassA', LabelText: '案件番号' },
        { ColumnName: 'StartTime', LabelText: '開始' },
      ],
    },
  },
};

const fetcher = async (siteId: number): Promise<RawSite> => {
  const s = SAMPLE_SITES[siteId];
  if (!s) throw new Error(`unknown siteId in mock: ${siteId}`);
  return s;
};

describe('runIntrospect', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'pleasync-introspect-test-'));
  });

  it('単一 site → 1 model schema を YAML 文字列で返す', async () => {
    const result = await runIntrospect({
      siteIds: [35535],
      fetchSite: fetcher,
    });

    expect(result.modelCount).toBe(1);
    expect(result.outputPath).toBeNull();
    expect(result.yaml).toContain('Auto-generated');
    expect(result.yaml).toContain('customer:');
    expect(result.yaml).toContain('siteId: 35535');
    expect(result.yaml).toContain('parentId: 35534');
    expect(result.yaml).toContain('type: Results');
  });

  it('複数 site → models をまとめて 1 schema に', async () => {
    const result = await runIntrospect({
      siteIds: [35535, 35536],
      fetchSite: fetcher,
    });

    expect(result.modelCount).toBe(2);
    expect(result.yaml).toContain('customer:');
    expect(result.yaml).toContain('issue:');
    expect(result.yaml).toContain('siteId: 35535');
    expect(result.yaml).toContain('siteId: 35536');
  });

  it('--out 指定でファイル書き込み', async () => {
    const result = await runIntrospect({
      siteIds: [35535],
      out: 'out/schema.yaml',
      cwd: workDir,
      fetchSite: fetcher,
    });

    expect(result.outputPath).toBeTruthy();
    const content = await readFile(result.outputPath!, 'utf-8');
    expect(content).toContain('customer:');
  });

  it('siteId も --package も無い → throw', async () => {
    await expect(
      runIntrospect({ siteIds: [], fetchSite: fetcher }),
    ).rejects.toThrow(/no sites to introspect/);
  });

  describe('--package 経路', () => {
    let workDir: string;

    beforeEach(async () => {
      const { mkdtemp } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      workDir = await mkdtemp(join(tmpdir(), 'pleasync-introspect-pkg-'));
    });

    it('SitePackage JSON から複数 model を生成', async () => {
      const { writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');

      const pkg = {
        Sites: [
          {
            SiteId: 100,
            Title: 'Root',
            ReferenceType: 'Sites',
            ParentId: 0,
            SiteSettings: {},
          },
          {
            SiteId: 101,
            Title: 'Customer',
            ReferenceType: 'Results',
            ParentId: 100,
            SiteSettings: {
              Columns: [{ ColumnName: 'ClassA', LabelText: 'コード' }],
            },
          },
          {
            SiteId: 102,
            Title: 'Issue',
            ReferenceType: 'Issues',
            ParentId: 100,
            SiteSettings: {
              Columns: [{ ColumnName: 'StartTime', LabelText: '開始' }],
            },
          },
        ],
      };
      const pkgPath = join(workDir, 'pkg.json');
      await writeFile(pkgPath, JSON.stringify(pkg));

      const result = await runIntrospect({
        siteIds: [],
        packagePath: pkgPath,
      });

      expect(result.modelCount).toBe(2);
      expect(result.yaml).toContain('customer:');
      expect(result.yaml).toContain('issue:');
      expect(result.yaml).not.toContain('root:'); // フォルダは除外
    });

    it('--package と siteIds 同時指定 → throw', async () => {
      await expect(
        runIntrospect({
          siteIds: [35535],
          packagePath: '/some/file.json',
          fetchSite: fetcher,
        }),
      ).rejects.toThrow(/cannot use --package together with siteIds/);
    });
  });

  it('Status の choices が YAML に出力される', async () => {
    const result = await runIntrospect({
      siteIds: [35535],
      fetchSite: fetcher,
    });
    expect(result.yaml).toContain('value: 100');
    expect(result.yaml).toContain('label: 新規');
  });
});

describe('serializeSchema', () => {
  it('header コメント付き YAML', () => {
    const yaml = serializeSchema({ version: '1', models: {} });
    expect(yaml).toMatch(/^# Auto-generated/);
    // YAML library は string '1' を quote して出力する（数値と区別するため）
    expect(yaml).toMatch(/version:\s*['"]1['"]/);
  });

  it('parseSchema で読み返しても等価', async () => {
    const { parseSchema } = await import('@pleasync/schema');
    const original = serializeSchema({
      version: '1',
      models: {
        m: {
          type: 'Results',
          parentId: 1,
          siteId: 100,
          title: 'M',
          fields: {
            code: { slot: 'ClassA', label: 'コード', type: 'text' },
          },
        },
      },
    });
    const reparsed = parseSchema(original);
    expect(reparsed.models.m.siteId).toBe(100);
    expect(reparsed.models.m.fields.code).toMatchObject({
      slot: 'ClassA',
      type: 'text',
    });
  });
});
