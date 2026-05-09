// Pleasanter "SitePackage" JSON loader.
//
// Pleasanter UI から「サイトパッケージのエクスポート」をすると親サイト + 全配下サイトを
// 含む 1 つの JSON ファイルが落ちてくる。これを読んで RawSite[] に変換する。
// `pleasync introspect --package <path>` で利用。

import { readFile } from 'node:fs/promises';
import type { RawSite } from './introspect.js';

/** Pleasanter SitePackage の概略構造（必要部分のみ） */
export interface SitePackageJson {
  HeaderInfo?: {
    BaseSiteId?: number;
    Server?: string;
    Convertors?: Array<{
      SiteId?: number;
      SiteTitle?: string;
      ReferenceType?: string;
      Order?: string | null;
    }>;
  };
  Sites?: RawSite[];
}

export interface LoadPackageOptions {
  /** Sites 型 (フォルダ) も結果に含めるか。デフォルトは false (除外)。 */
  includeFolders?: boolean;
}

/**
 * SitePackage JSON ファイルを読み、含まれる site の配列を返す。
 *
 * - BOM (`﻿`) を自動で剥がす
 * - `Sites` 配列が無い JSON は throw
 * - デフォルトで `ReferenceType: 'Sites'` (フォルダ) は除外する
 *   フォルダは columns を持たないので introspect しても空 model になるだけ
 */
export async function loadSitePackageFile(
  path: string,
  options: LoadPackageOptions = {},
): Promise<RawSite[]> {
  const raw = await readFile(path, 'utf-8');
  const stripped = raw.startsWith('﻿') ? raw.slice(1) : raw;
  return parseSitePackageJson(stripped, options);
}

/** 既にメモリ上にある JSON 文字列 / オブジェクトを解析（テスト用にも便利） */
export function parseSitePackageJson(
  jsonOrText: string | SitePackageJson,
  options: LoadPackageOptions = {},
): RawSite[] {
  let data: SitePackageJson;
  if (typeof jsonOrText === 'string') {
    try {
      data = JSON.parse(jsonOrText) as SitePackageJson;
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new SyntaxError(`SitePackage JSON parse error: ${cause}`);
    }
  } else {
    data = jsonOrText;
  }

  if (!data || !Array.isArray(data.Sites)) {
    throw new Error('SitePackage JSON is missing the top-level "Sites" array');
  }

  const sites = data.Sites;
  if (options.includeFolders) {
    return sites;
  }
  return sites.filter((s) => s.ReferenceType !== 'Sites');
}
