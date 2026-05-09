import { parse as parseYaml } from 'yaml';
import type { SchemaAst, ServerConfig } from './ast.js';

/**
 * pleasync.schema.yaml の文字列を AST にパースする。
 *
 * - YAML syntax error は SyntaxError として投げる
 * - **env 展開はしない**。`${ENV_VAR}` はリテラルとして AST に残る。
 *   実際に server.* の値が必要なタイミング（apply/plan 等）で
 *   `resolveServerConfig` を呼んで展開する。
 * - 構造のバリデーションは行わない（validateSchema で別途実施）
 */
export function parseSchema(yamlText: string): SchemaAst {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new SyntaxError(`schema YAML parse error: ${cause}`);
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new SyntaxError('schema must be a YAML mapping at top level');
  }

  return raw as unknown as SchemaAst;
}

const ENV_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

/**
 * server.* の `${ENV_VAR}` を実際に展開する。
 *
 * codegen では呼ばない（server.* を読まないため）。
 * apply/plan 等の Pleasanter 接続が必要な処理から呼ぶ。
 *
 * 未定義の env を参照していたら例外を投げる。
 */
export function resolveServerConfig(server: ServerConfig): ServerConfig {
  return {
    baseUrl: expandEnvInString(server.baseUrl),
    apiKey: expandEnvInString(server.apiKey),
    apiVersion:
      server.apiVersion !== undefined
        ? expandEnvInString(server.apiVersion)
        : undefined,
  };
}

function expandEnvInString(input: string): string {
  return input.replace(ENV_PATTERN, (_match, name: string) => {
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`required env var '${name}' is not set`);
    }
    return value;
  });
}
