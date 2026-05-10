import { readFile, writeFile } from 'node:fs/promises';
import { Engine, type PleasanterApi } from '@pleasync/orm';
import { parseDocument } from 'yaml';
import type { Choice, Field, Model } from '@pleasync/schema';
import {
  computePlan,
  type ComputePlanResult,
  type PlanCommandOptions,
} from './command-plan.js';
import type { ModelDiff } from './diff.js';
import type { RawSite } from './introspect.js';

export interface ApplyCommandOptions extends PlanCommandOptions {
  /** schema YAML への siteId write-back を抑止（dry-run 的用途、ただし create 自体は実行する） */
  skipSchemaWriteback?: boolean;
  /**
   * 破壊的操作（schema にない既存 column の削除）を許可する。
   * デフォルト false (安全側) で orphan column は保持される。
   * `true` で更新時に Pleasanter 側から該当 column を取り除く。
   */
  allowDestroy?: boolean;
  /** テスト用: PleasanterApi を直接注入。 */
  api?: PleasanterApi;
}

export interface ApplyResult {
  planSummary: string;
  created: { modelName: string; newSiteId: number }[];
  updated: { modelName: string; siteId: number }[];
  unchanged: { modelName: string; siteId: number }[];
}

/**
 * `pleasync apply`: plan を計算して Pleasanter に適用する。
 *
 * 操作:
 * - create: createSite で新規サイト → 続けて updateSite で columns を反映
 * - update: 現状の columns に schema の差分をマージ → updateSite
 * - unchanged: skip
 *
 * 副作用: create された model については schema YAML の siteId を書き戻す
 * （skipSchemaWriteback を指定しなければ）。
 */
export async function runApply(
  options: ApplyCommandOptions,
): Promise<ApplyResult> {
  const computed = await computePlan(options);

  const api = options.api ?? (await defaultApi(options));

  const created: ApplyResult['created'] = [];
  const updated: ApplyResult['updated'] = [];
  const unchanged: ApplyResult['unchanged'] = [];

  for (const diff of computed.plan.models) {
    if (diff.kind === 'unchanged') {
      unchanged.push({ modelName: diff.modelName, siteId: diff.siteId });
      continue;
    }

    if (diff.kind === 'create') {
      const newId = await applyCreate(diff.model, api);
      created.push({ modelName: diff.modelName, newSiteId: newId });
      continue;
    }

    // update
    const didMutate = await applyUpdate(
      diff,
      computed.existingSites[diff.modelName],
      api,
      options.allowDestroy ?? false,
    );
    if (didMutate) {
      updated.push({ modelName: diff.modelName, siteId: diff.siteId });
    } else {
      // orphan のみ + --allow-destroy 無し等で実質何もしないケース
      unchanged.push({ modelName: diff.modelName, siteId: diff.siteId });
    }
  }

  // schema write-back: create された siteId を YAML に書き戻す
  if (!options.skipSchemaWriteback && created.length > 0) {
    await writeBackSiteIds(computed.schemaPath, created);
  }

  return {
    planSummary: formatSummary(created, updated, unchanged),
    created,
    updated,
    unchanged,
  };
}

// === create ===

async function applyCreate(model: Model, api: PleasanterApi): Promise<number> {
  // 1. createSite で新規サイトを作る
  const siteId = await api.createSite(model.parentId, {
    Title: model.title,
    ReferenceType: model.type,
    SiteSettings: { ReferenceType: model.type, Version: 1.017 },
  });

  // 2. fields があれば updateSite で columns を設定
  const columns = fieldsToColumns(model.fields);
  if (columns.length > 0) {
    await api.updateSite(siteId, {
      SiteSettings: { Columns: columns },
    });
  }

  return siteId;
}

// === update ===

/**
 * 更新を実行。実際に updateSite を呼んだら true を返す。
 * orphan のみ + --allow-destroy 無し等で何もしないケースは false。
 */
async function applyUpdate(
  diff: ModelDiff & { kind: 'update' },
  existing: RawSite | undefined,
  api: PleasanterApi,
  allowDestroy: boolean,
): Promise<boolean> {
  const payload: Record<string, unknown> = {};

  // title diff
  for (const ch of diff.changes) {
    if (ch.kind === 'title') {
      payload.Title = ch.to;
    }
  }

  // columns diff: existing columns + schema 側の変更をマージ
  const hasColumnChange = diff.changes.some(
    (c) =>
      c.kind === 'add-column' ||
      c.kind === 'update-column-label' ||
      c.kind === 'update-column-choices',
  );
  // allowDestroy が true で orphan が居る → 削除のため update に含める
  const hasDestructiveOrphan =
    allowDestroy &&
    diff.changes.some((c) => c.kind === 'orphan-column');

  if (hasColumnChange || hasDestructiveOrphan) {
    const merged = mergeColumns(existing, diff, allowDestroy);
    payload.SiteSettings = { Columns: merged };
  }

  if (Object.keys(payload).length === 0) {
    return false;
  }

  await api.updateSite(diff.siteId, payload);
  return true;
}

interface ColumnEntry {
  ColumnName: string;
  LabelText?: string;
  ChoicesText?: string;
}

/**
 * 既存の columns + schema 側の差分を統合した完全な Columns 配列を返す。
 *
 * - existing にあるが schema にない slot → デフォルトでは保持。
 *   ただし `allowDestroy === true` のときは削除（orphan-column は除外する）
 * - schema で add-column → 追加
 * - schema で update-column-label/choices → 該当 entry を変更
 * - schema にあって existing と一致 → 何もしない
 */
function mergeColumns(
  existing: RawSite | undefined,
  diff: ModelDiff & { kind: 'update' },
  allowDestroy: boolean,
): ColumnEntry[] {
  const map = new Map<string, ColumnEntry>();

  for (const col of existing?.SiteSettings?.Columns ?? []) {
    if (!col.ColumnName) continue;
    map.set(col.ColumnName, { ...col, ColumnName: col.ColumnName });
  }

  // allowDestroy なら orphan-column を map から削除（apply で site から消える）
  if (allowDestroy) {
    for (const ch of diff.changes) {
      if (ch.kind === 'orphan-column') {
        map.delete(ch.slot);
      }
    }
  }

  for (const ch of diff.changes) {
    if (ch.kind === 'add-column') {
      map.set(ch.slot, fieldToColumn(ch.field));
    } else if (ch.kind === 'update-column-label') {
      const cur = map.get(ch.slot) ?? { ColumnName: ch.slot };
      map.set(ch.slot, { ...cur, LabelText: ch.to });
    } else if (ch.kind === 'update-column-choices') {
      const cur = map.get(ch.slot) ?? { ColumnName: ch.slot };
      map.set(ch.slot, { ...cur, ChoicesText: choicesToText(ch.to) });
    }
  }

  return Array.from(map.values());
}

function fieldsToColumns(fields: Record<string, Field>): ColumnEntry[] {
  return Object.values(fields).map(fieldToColumn);
}

function fieldToColumn(field: Field): ColumnEntry {
  const entry: ColumnEntry = {
    ColumnName: field.slot,
    LabelText: field.label,
  };

  if (field.type === 'status' || field.type === 'class') {
    const choices = (field as { choices?: unknown }).choices;
    if (Array.isArray(choices)) {
      entry.ChoicesText = choicesToText(choices as Choice[]);
    }
  }

  return entry;
}

function choicesToText(list: Choice[]): string {
  return list.map((c) => `${c.value},${c.label}`).join('\n');
}

// === schema write-back ===

async function writeBackSiteIds(
  schemaPath: string,
  created: { modelName: string; newSiteId: number }[],
): Promise<void> {
  const original = await readFile(schemaPath, 'utf-8');
  const doc = parseDocument(original);

  const models = doc.get('models');
  if (!models || typeof (models as { set?: unknown }).set !== 'function') {
    // models が無い・型が想定外 → write-back しない（user に手動で頼む）
    return;
  }

  for (const { modelName, newSiteId } of created) {
    const model = (models as { get: (k: string) => unknown }).get(modelName);
    if (!model || typeof (model as { set?: unknown }).set !== 'function') {
      continue;
    }
    (model as { set: (k: string, v: unknown) => void }).set('siteId', newSiteId);
  }

  await writeFile(schemaPath, doc.toString(), 'utf-8');
}

// === defaults ===

async function defaultApi(
  options: ApplyCommandOptions,
): Promise<PleasanterApi> {
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
  return engine.api_();
}

function formatSummary(
  created: ApplyResult['created'],
  updated: ApplyResult['updated'],
  unchanged: ApplyResult['unchanged'],
): string {
  const lines: string[] = [];
  for (const c of created) {
    lines.push(`+ ${c.modelName} (siteId=${c.newSiteId}) created`);
  }
  for (const u of updated) {
    lines.push(`~ ${u.modelName} (siteId=${u.siteId}) updated`);
  }
  for (const u of unchanged) {
    lines.push(`= ${u.modelName} (siteId=${u.siteId}) unchanged`);
  }
  lines.push(
    `\nApplied: ${created.length} created, ${updated.length} updated, ${unchanged.length} unchanged.`,
  );
  return lines.join('\n') + '\n';
}

// === CLI entry ===

export async function runApplyCommand(argv: readonly string[]): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`pleasync apply

Usage:
  pleasync apply [options]

Options:
  --schema <path>          Schema YAML file (default: ./pleasync.schema.yaml)
  --base-url <url>         Pleasanter base URL (or PLEASANTER_BASE_URL env)
  --api-key <key>          API key (or PLEASANTER_API_KEY env)
  --api-version <v>        API version (default: 1.1)
  --skip-schema-writeback  Do not auto-update siteId in schema YAML
  --allow-destroy          Delete orphan columns (existing columns not in schema).
                           Without this flag, orphan columns are preserved.
                           DESTRUCTIVE: column data will be lost.
  -h, --help               Show this help

Note: \`apply\` makes changes to Pleasanter. Run \`pleasync plan\` first to review.
`);
    return;
  }

  const result = await runApply(options);
  process.stdout.write(result.planSummary);
}

function parseArgs(
  argv: readonly string[],
): ApplyCommandOptions & { help?: boolean } {
  const opts: ApplyCommandOptions & { help?: boolean } = {};

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
      case '--skip-schema-writeback':
        opts.skipSchemaWriteback = true;
        break;
      case '--allow-destroy':
        opts.allowDestroy = true;
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

export type { ComputePlanResult } from './command-plan.js';
