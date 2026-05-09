import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const mod = await import('@pleasync/client');

    // node_modules から package.json を直接読む（webpack の解決を回避）
    const mainPkg = JSON.parse(
      readFileSync(
        join(process.cwd(), 'node_modules/@pleasync/client/package.json'),
        'utf-8',
      ),
    ) as { name: string; version: string };

    // 自プラットフォーム用のサブパッケージ情報も読む
    const platformPkgName = `@pleasync/client-${process.platform}-${process.arch}-${process.platform === 'win32' ? 'msvc' : 'gnu'}`;
    let platformPkg: { name: string; version: string } | null = null;
    try {
      platformPkg = JSON.parse(
        readFileSync(
          join(process.cwd(), `node_modules/${platformPkgName}/package.json`),
          'utf-8',
        ),
      );
    } catch {
      // 該当 platform sub-package がインストールされていない（host platform 不一致など）
    }

    return NextResponse.json({
      ok: true,
      package: { name: mainPkg.name, version: mainPkg.version },
      platformPackage: platformPkg
        ? { name: platformPkg.name, version: platformPkg.version }
        : null,
      exported: Object.keys(mod),
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      { ok: false, error: error.message, stack: error.stack },
      { status: 500 },
    );
  }
}
