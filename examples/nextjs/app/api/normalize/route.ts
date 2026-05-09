import { NextResponse } from 'next/server';
import { normalize, sortedJsonStringify } from '@pleasync/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Rust 側 normalizer の挙動を確認するためのサンプルデータ
    const input = {
      Title: 'テストサイト',
      ZField: 'last',
      AField: 'first',
      MField: 'middle',
      // 以下は normalize() で除外される想定（Pleasanter のサーバー管理フィールド）
      UpdatedTime: '2026-01-01T00:00:00Z',
      CreatedTime: '2025-12-31T23:59:59Z',
      Creator: { Id: 1, Name: 'admin' },
      Updator: { Id: 1, Name: 'admin' },
      Guid: '00000000-0000-0000-0000-000000000000',
      Ver: 1,
      // 空値も除外される想定
      Empty: '',
      EmptyArray: [],
      EmptyObject: {},
      // ネストオブジェクトもキーソート
      Nested: {
        ZNested: 'last',
        ANested: 'first',
      },
    };

    const cleaned = normalize(input);
    const jsonSorted = sortedJsonStringify(input, 2);

    return NextResponse.json({
      ok: true,
      input,
      // normalize() の結果: 不要キー除外 + キーソート
      normalized: cleaned,
      // sortedJsonStringify() の結果: キーソートして JSON 文字列化
      sortedJson: jsonSorted,
      summary: {
        inputKeys: Object.keys(input).length,
        normalizedKeys: cleaned ? Object.keys(cleaned).length : 0,
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
