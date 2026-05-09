import { NextResponse } from 'next/server';
import { PleasanterClient } from '@pleasync/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const baseUrl = process.env.PLEASANTER_BASE_URL;
    const apiKey = process.env.PLEASANTER_API_KEY;
    const apiVersion = process.env.PLEASANTER_API_VERSION ?? '1.1';

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '.env.local に PLEASANTER_BASE_URL / PLEASANTER_API_KEY を設定してください',
        },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const idParam =
      url.searchParams.get('id') ?? process.env.PLEASANTER_TEST_SITE_ID;

    if (!idParam) {
      return NextResponse.json(
        { ok: false, error: '?id=<siteId> または PLEASANTER_TEST_SITE_ID 必須' },
        { status: 400 },
      );
    }

    const siteId = Number(idParam);
    if (!Number.isFinite(siteId) || siteId <= 0) {
      return NextResponse.json(
        { ok: false, error: `Invalid siteId: ${idParam}` },
        { status: 400 },
      );
    }

    const client = new PleasanterClient({ baseUrl, apiKey, apiVersion });
    const site = await client.getSite(siteId);

    return NextResponse.json({ ok: true, siteId, site });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}
