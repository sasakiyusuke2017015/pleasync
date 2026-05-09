import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const mod = await import('@pleasync/client');
    const exported = Object.keys(mod);

    const baseUrl = process.env.PLEASANTER_BASE_URL;
    const apiKey = process.env.PLEASANTER_API_KEY;
    const apiVersion = process.env.PLEASANTER_API_VERSION ?? '1.1';

    let constructed = false;
    if (baseUrl && apiKey) {
      new mod.PleasanterClient({ baseUrl, apiKey, apiVersion });
      constructed = true;
    }

    return NextResponse.json({
      ok: true,
      nativeBindingLoaded: true,
      exported,
      constructed,
      env: {
        hasBaseUrl: Boolean(baseUrl),
        hasApiKey: Boolean(apiKey),
        apiVersion,
      },
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 },
    );
  }
}
