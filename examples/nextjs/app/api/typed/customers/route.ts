import { NextResponse } from 'next/server';
import { PleasyncClient } from '../../../../pleasync-generated';

export const dynamic = 'force-dynamic';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function getClient(): Promise<PleasyncClient> {
  return PleasyncClient.fromConfig({
    baseUrl: requiredEnv('PLEASANTER_BASE_URL'),
    apiKey: requiredEnv('PLEASANTER_API_KEY'),
    apiVersion: process.env.PLEASANTER_API_VERSION ?? '1.1',
  });
}

/**
 * GET /api/typed/customers
 *   全件取得。
 *
 * GET /api/typed/customers?status=100
 *   status で絞り込み。
 */
export async function GET(request: Request) {
  try {
    const client = await getClient();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');

    const customers = statusParam
      ? await client.customer.findMany({
          where: { status: Number(statusParam) as 100 | 200 | 900 },
        })
      : await client.customer.findMany();

    return NextResponse.json({ ok: true, count: customers.length, customers });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { ok: false, error: error.message, stack: error.stack },
      { status: 500 },
    );
  }
}

/**
 * POST /api/typed/customers
 *   body: { title: string, body?: string, status?: 100 | 200 | 900 }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      body?: string;
      status?: 100 | 200 | 900;
    };

    if (!body.title) {
      return NextResponse.json(
        { ok: false, error: '`title` is required' },
        { status: 400 },
      );
    }

    const client = await getClient();
    const created = await client.customer.create({
      data: {
        title: body.title,
        body: body.body,
        status: body.status,
      },
    });

    return NextResponse.json({ ok: true, customer: created });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}
