import { NextResponse } from 'next/server';
import { PleasanterClient } from '@pleasync/client';

export const dynamic = 'force-dynamic';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const idParam =
      url.searchParams.get('id') ?? process.env.PLEASANTER_TEST_SITE_ID;

    if (!idParam) {
      return NextResponse.json(
        { ok: false, error: 'Provide ?id=<siteId> or set PLEASANTER_TEST_SITE_ID' },
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

    const client = new PleasanterClient({
      baseUrl: requiredEnv('PLEASANTER_BASE_URL'),
      apiKey: requiredEnv('PLEASANTER_API_KEY'),
      apiVersion: process.env.PLEASANTER_API_VERSION ?? '1.1',
    });

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
