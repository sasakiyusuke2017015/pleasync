import { NextResponse } from 'next/server';
import { PleasyncClient } from '../../../../../pleasync-generated';

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

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/typed/customers/:id */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient();
    const record = await client.customer.findUnique({
      where: { id: Number(id) },
    });
    if (record === null) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, customer: record });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/** PATCH /api/typed/customers/:id  body: { title?, body?, status? } */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      title?: string;
      body?: string;
      status?: 100 | 200 | 900;
    };

    const client = await getClient();
    await client.customer.update({
      where: { id: Number(id) },
      data: body,
    });

    const updated = await client.customer.findUnique({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true, customer: updated });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/** DELETE /api/typed/customers/:id */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient();
    await client.customer.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true, deletedId: Number(id) });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
