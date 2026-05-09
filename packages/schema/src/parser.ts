import { parse as parseYaml } from 'yaml';
import type { SchemaAst, ServerConfig } from './ast.js';

/**
 * pleasync.schema.yaml の文字列を AST にパースする。
 *
 * - YAML syntax error は SyntaxError として投げる
 * - server.* の `${ENV_VAR}` は process.env から展開する。未定義なら投げる。
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

  // server.* で環境変数展開
  const expanded = expandEnvInServer(raw as Record<string, unknown>);

  return expanded as unknown as SchemaAst;
}

const ENV_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

function expandEnvInServer(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (raw.server === undefined || raw.server === null) {
    return raw;
  }
  const server = raw.server as Record<string, unknown>;
  const expanded: Record<string, unknown> = { ...server };

  for (const key of ['baseUrl', 'apiKey', 'apiVersion'] as const) {
    const value = server[key];
    if (typeof value === 'string') {
      expanded[key] = expandEnvInString(value);
    }
  }

  return { ...raw, server: expanded as unknown as ServerConfig };
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
