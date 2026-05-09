import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSitePackageFile,
  parseSitePackageJson,
  type SitePackageJson,
} from '../site-package.js';

const SAMPLE: SitePackageJson = {
  HeaderInfo: {
    BaseSiteId: 100,
    Server: 'https://example.com',
    Convertors: [
      { SiteId: 100, SiteTitle: 'Root', ReferenceType: 'Sites', Order: '[101,102]' },
      { SiteId: 101, SiteTitle: 'Customer', ReferenceType: 'Results', Order: null },
      { SiteId: 102, SiteTitle: 'Issue', ReferenceType: 'Issues', Order: null },
    ],
  },
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
        Columns: [
          { ColumnName: 'ClassA', LabelText: '顧客コード' },
          { ColumnName: 'ClassB', LabelText: '名前' },
        ],
      },
    },
    {
      SiteId: 102,
      Title: 'Issue',
      ReferenceType: 'Issues',
      ParentId: 100,
      SiteSettings: {
        Columns: [
          { ColumnName: 'ClassA', LabelText: '案件番号' },
          { ColumnName: 'StartTime', LabelText: '開始' },
        ],
      },
    },
  ],
};

describe('parseSitePackageJson', () => {
  it('Sites 配列を返す（フォルダはデフォルトで除外）', () => {
    const sites = parseSitePackageJson(SAMPLE);
    expect(sites).toHaveLength(2);
    const ids = sites.map((s) => s.SiteId);
    expect(ids).toEqual([101, 102]); // 100 (Sites) は除外
  });

  it('--include-folders 相当で Sites も含む', () => {
    const sites = parseSitePackageJson(SAMPLE, { includeFolders: true });
    expect(sites).toHaveLength(3);
  });

  it('JSON 文字列入力も受け付ける', () => {
    const sites = parseSitePackageJson(JSON.stringify(SAMPLE));
    expect(sites).toHaveLength(2);
  });

  it('Sites 配列が無いオブジェクト → throw', () => {
    expect(() => parseSitePackageJson({} as SitePackageJson)).toThrow(/Sites/);
  });

  it('JSON syntax error → SyntaxError', () => {
    expect(() => parseSitePackageJson('{ invalid')).toThrow(SyntaxError);
  });

  it('null / undefined → throw', () => {
    expect(() =>
      parseSitePackageJson(null as unknown as SitePackageJson),
    ).toThrow(/Sites/);
  });
});

describe('loadSitePackageFile', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'pleasync-pkg-test-'));
  });

  it('JSON ファイルから Sites を読む', async () => {
    const path = join(workDir, 'package.json');
    await writeFile(path, JSON.stringify(SAMPLE));
    const sites = await loadSitePackageFile(path);
    expect(sites).toHaveLength(2);
  });

  it('BOM 付き JSON も読める', async () => {
    const path = join(workDir, 'bom.json');
    await writeFile(path, '﻿' + JSON.stringify(SAMPLE), 'utf-8');
    const sites = await loadSitePackageFile(path);
    expect(sites).toHaveLength(2);
  });

  it('存在しないファイル → throw', async () => {
    await expect(
      loadSitePackageFile(join(workDir, 'nope.json')),
    ).rejects.toThrow();
  });
});
