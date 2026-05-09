import type { EngineConfig, PleasanterApi } from './types.js';

/**
 * @pleasync/client の `PleasanterClient` をラップして ORM ランタイムに渡す。
 *
 * - 通常: `new Engine(config)` で内部に PleasanterClient を生成
 * - テスト: `Engine.fromApi(fakeApi)` で fake を注入
 */
export class Engine {
  constructor(private readonly api: PleasanterApi) {}

  /** 接続設定から Engine を作る（本番経路）。 */
  static async fromConfig(config: EngineConfig): Promise<Engine> {
    // dynamic import で @pleasync/client のロードを実利用時のみに（テストで重い napi を起こさない）
    const mod = await import('@pleasync/client');
    const client = new mod.PleasanterClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      apiVersion: config.apiVersion ?? '1.1',
    });
    return new Engine(client as unknown as PleasanterApi);
  }

  /** 任意の PleasanterApi 実装を注入する（テスト用）。 */
  static fromApi(api: PleasanterApi): Engine {
    return new Engine(api);
  }

  /** 内部 API（ModelCollection からのみ呼ばれる） */
  api_(): PleasanterApi {
    return this.api;
  }
}
