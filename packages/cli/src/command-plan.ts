import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { Engine } from '@pleasync/orm';
import {
  parseSchema,
  validateSchema,
  type SchemaAst,
} from '@pleasync/schema';
import { formatPlan, planDiff, type PlanResult } from './diff.js';
import type { RawSite } from './introspect.js';

export interface PlanCommandOptions {
  schema?: string;
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
  cwd?: string;
  /** テスト用: getSite を直接注入 */
  fetchSite?: (siteId: number) => Promise<RawSite>;
}

export interface PlanCommandResult {
  plan: PlanResult;
  text: string;
}

/** computePlan の戻り値: plan に加えて元 AST と取得済 site map を返す（apply で再利用） */
export interface ComputePlanResult {
  ast: SchemaAst;
  schemaPath: string;
  existingSites: Record<string, RawSite>;
  plan: PlanResult;
}

/**
 * schema 読み込み → 各 model の getSite → diff 計算まで。副作用なし。
 * runPlan / runApply の両方で再利用する共通ロジック。
 */
export async function computePlan(
  options: PlanCommandOptions,
): Promise<ComputePlanResult> {
  const cwd = options.cwd ?? process.cwd();
  const schemaPath = resolveRelative(
    options.schema ?? 'pleasync.schema.yaml',
    cwd,
  );
  const yaml = await readFile(schemaPath, 'utf-8');

  const ast = parseSchema(yaml);
  const result = validateSchema(ast);
  if (!result.ok) {
    const lines = result.errors.map(
      (e) => `  [${e.code}] ${e.path}: ${e.message}`,
    );
    throw new Error(`schema validation failed:\n${lines.join('\n')}`);
  }

  // siteId 指定がある model が無ければ fetchSite は呼ばない（env なしでも動く）
  const needsFetch = Object.values(result.ast.models).some(
    (m) => typeof m.siteId === 'number' && m.siteId > 0,
  );
  const fetchSite = needsFetch
    ? (options.fetchSite ?? (await defaultFetcher(options)))
    : null;

  const existingSites: Record<string, RawSite> = {};
  for (const [modelName, model] of Object.entries(result.ast.models)) {
    if (typeof model.siteId !== 'number' || model.siteId <= 0) {
      continue;
    }
    try {
      const raw = await fetchSite!(model.siteId);
      existingSites[modelName] = raw;
    } catch (err) {
      if (isNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }

  const plan = planDiff({ ast: result.ast, existingSites });
  return { ast: result.ast, schemaPath, existingSites, plan };
}

/**
 * `pleasync plan` の中身。computePlan + 整形。
 */
export async function runPlan(
  options: PlanCommandOptions,
): Promise<PlanCommandResult> {
  const { plan } = await computePlan(options);
  const text = formatPlan(plan);
  return { plan, text };
}

export async function runPlanCommand(argv: readonly string[]): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`pleasync plan

Usage:
  pleasync plan [options]

Options:
  --schema <path>    Schema YAML file (default: ./pleasync.schema.yaml)
  --base-url <url>   Pleasanter base URL (or PLEASANTER_BASE_URL env)
  --api-key <key>    API key (or PLEASANTER_API_KEY env)
  --api-version <v>  API version (default: 1.1)
  -h, --help         Show this help

Output: human-readable plan summary to stdout (no side effects on Pleasanter).
`);
    return;
  }

  const result = await runPlan(options);
  process.stdout.write(result.text);
}

async function defaultFetcher(
  options: PlanCommandOptions,
): Promise<(siteId: number) => Promise<RawSite>> {
  const baseUrl = options.baseUrl ?? process.env.PLEASANTER_BASE_URL;
  const apiKey = options.apiKey ?? process.env.PLEASANTER_API_KEY;
  const apiVersion =
    options.apiVersion ?? process.env.PLEASANTER_API_VERSION ?? '1.1';

  if (!baseUrl || !apiKey) {
    throw new Error(
      'PLEASANTER_BASE_URL and PLEASANTER_API_KEY are required',
    );
  }

  const engine = await Engine.fromConfig({ baseUrl, apiKey, apiVersion });
  return async (siteId: number) => {
    return (await engine.api_().getSite(siteId)) as RawSite;
  };
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    return /404|not found/i.test(err.message);
  }
  return false;
}

function resolveRelative(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function parseArgs(
  argv: readonly string[],
): PlanCommandOptions & { help?: boolean } {
  const opts: PlanCommandOptions & { help?: boolean } = {};

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--schema':
        opts.schema = argv[++i];
        break;
      case '--base-url':
        opts.baseUrl = argv[++i];
        break;
      case '--api-key':
        opts.apiKey = argv[++i];
        break;
      case '--api-version':
        opts.apiVersion = argv[++i];
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        throw new Error(`unknown option: ${a}`);
    }
  }

  return opts;
}
