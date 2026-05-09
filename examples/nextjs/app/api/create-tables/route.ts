import { NextResponse } from 'next/server';
import { PleasanterClient } from '@pleasync/client';

export const dynamic = 'force-dynamic';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

/**
 * 親サイト配下に複数テーブルをまとめて作成する。
 *
 * 例:
 *   POST /api/create-tables?parentId=35534
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const parentIdParam =
      url.searchParams.get('parentId') ?? process.env.PLEASANTER_TEST_SITE_ID;

    if (!parentIdParam) {
      return NextResponse.json(
        { ok: false, error: '?parentId=<siteId> または PLEASANTER_TEST_SITE_ID 必須' },
        { status: 400 },
      );
    }

    const parentId = Number(parentIdParam);
    if (!Number.isFinite(parentId) || parentId <= 0) {
      return NextResponse.json(
        { ok: false, error: `Invalid parentId: ${parentIdParam}` },
        { status: 400 },
      );
    }

    const client = new PleasanterClient({
      baseUrl: requiredEnv('PLEASANTER_BASE_URL'),
      apiKey: requiredEnv('PLEASANTER_API_KEY'),
      apiVersion: process.env.PLEASANTER_API_VERSION ?? '1.1',
    });

    // 作成するテーブルの定義
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const tablesToCreate = [
      {
        Title: `顧客マスタ (${stamp})`,
        ReferenceType: 'Results',
        SiteSettings: {
          ReferenceType: 'Results',
          Version: 1.017,
        },
      },
      {
        Title: `案件管理 (${stamp})`,
        ReferenceType: 'Issues',
        SiteSettings: {
          ReferenceType: 'Issues',
          Version: 1.017,
        },
      },
      {
        Title: `作業メモ (${stamp})`,
        ReferenceType: 'Wikis',
        SiteSettings: {
          ReferenceType: 'Wikis',
          Version: 1.017,
        },
      },
    ];

    const created: Array<{
      title: string;
      referenceType: string;
      siteId: number;
      url: string;
    }> = [];

    for (const def of tablesToCreate) {
      const siteId = await client.createSite(parentId, def);
      created.push({
        title: def.Title,
        referenceType: def.ReferenceType,
        siteId,
        url: `${requiredEnv('PLEASANTER_BASE_URL')}/items/${siteId}/index`,
      });
    }

    return NextResponse.json({
      ok: true,
      parentId,
      createdCount: created.length,
      created,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { ok: false, error: error.message, stack: error.stack },
      { status: 500 },
    );
  }
}
