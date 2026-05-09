// Schema model と Pleasanter site の差分計算。
//
// pleasync plan / apply の両方が消費する。

import type { Choice, Field, Model, SchemaAst } from '@pleasync/schema';
import type { RawSite } from './introspect.js';

/** 1 つの model に対する差分 */
export type ModelDiff =
  | { kind: 'create'; modelName: string; model: Model }
  | {
      kind: 'update';
      modelName: string;
      siteId: number;
      changes: Change[];
    }
  | { kind: 'unchanged'; modelName: string; siteId: number };

/** site / column 単位の変更単位 */
export type Change =
  | { kind: 'title'; from: string; to: string }
  | { kind: 'add-column'; slot: string; label: string; field: Field }
  | { kind: 'update-column-label'; slot: string; from: string; to: string }
  | {
      kind: 'update-column-choices';
      slot: string;
      from: Choice[];
      to: Choice[];
    }
  | { kind: 'orphan-column'; slot: string; existingLabel: string };

export interface PlanInput {
  ast: SchemaAst;
  /** logical model name → Pleasanter site (existing). 取得済の getSite 結果。 */
  existingSites: Record<string, RawSite>;
}

export interface PlanResult {
  models: ModelDiff[];
}

/**
 * Schema と現状の Pleasanter site から差分を計算。
 *
 * 副作用なし。`existingSites` は呼び出し側で getSite を実行して用意する。
 */
export function planDiff(input: PlanInput): PlanResult {
  const diffs: ModelDiff[] = [];

  for (const [modelName, model] of Object.entries(input.ast.models)) {
    const existing = input.existingSites[modelName];

    if (!existing) {
      diffs.push({ kind: 'create', modelName, model });
      continue;
    }

    const siteId =
      typeof existing.SiteId === 'number'
        ? existing.SiteId
        : Number(existing.SiteId ?? 0);

    const changes = diffModel(model, existing);

    if (changes.length === 0) {
      diffs.push({ kind: 'unchanged', modelName, siteId });
    } else {
      diffs.push({ kind: 'update', modelName, siteId, changes });
    }
  }

  return { models: diffs };
}

/** 1 model 内の変更点を列挙 */
function diffModel(model: Model, existing: RawSite): Change[] {
  const changes: Change[] = [];

  // title
  const existingTitle = existing.Title ?? '';
  if (model.title !== existingTitle) {
    changes.push({ kind: 'title', from: existingTitle, to: model.title });
  }

  // columns
  const existingColumns = existing.SiteSettings?.Columns ?? [];
  const existingBySlot = new Map<string, { LabelText?: string; ChoicesText?: string }>();
  for (const col of existingColumns) {
    if (col.ColumnName) {
      existingBySlot.set(col.ColumnName, {
        LabelText: col.LabelText,
        ChoicesText: col.ChoicesText,
      });
    }
  }

  const slotsInSchema = new Set<string>();

  for (const [, field] of Object.entries(model.fields)) {
    slotsInSchema.add(field.slot);
    const existingCol = existingBySlot.get(field.slot);

    if (!existingCol) {
      changes.push({
        kind: 'add-column',
        slot: field.slot,
        label: field.label,
        field,
      });
      continue;
    }

    // label の差分
    if ((existingCol.LabelText ?? '') !== field.label) {
      changes.push({
        kind: 'update-column-label',
        slot: field.slot,
        from: existingCol.LabelText ?? '',
        to: field.label,
      });
    }

    // choices の差分（status / class のみ）
    if (field.type === 'status' || field.type === 'class') {
      const desiredChoices = resolveChoices(field, []);
      const existingChoicesParsed = parseChoicesText(
        existingCol.ChoicesText ?? '',
      );

      if (!sameChoices(existingChoicesParsed, desiredChoices)) {
        changes.push({
          kind: 'update-column-choices',
          slot: field.slot,
          from: existingChoicesParsed,
          to: desiredChoices,
        });
      }
    }
  }

  // schema にないが site にあるカラム → orphan として情報のみ（apply では触らない）
  for (const [slot, col] of existingBySlot.entries()) {
    if (slotsInSchema.has(slot)) continue;
    // システムカラムは無視（IssueId/ResultId/Comments/Creator 等は管理外）
    if (isSystemColumn(slot)) continue;
    changes.push({
      kind: 'orphan-column',
      slot,
      existingLabel: col.LabelText ?? '',
    });
  }

  return changes;
}

function resolveChoices(field: Field, fallback: Choice[]): Choice[] {
  if (field.type !== 'status' && field.type !== 'class') return fallback;
  const c = (field as { choices?: unknown }).choices;
  if (Array.isArray(c)) return c as Choice[];
  return fallback;
}

function sameChoices(a: Choice[], b: Choice[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].value !== b[i].value || a[i].label !== b[i].label) {
      return false;
    }
  }
  return true;
}

const SYSTEM_COLUMNS = new Set([
  'SiteId',
  'IssueId',
  'ResultId',
  'WikiId',
  'Comments',
  'Creator',
  'Updator',
  'CreatedTime',
  'UpdatedTime',
  'Ver',
  'Guid',
]);

function isSystemColumn(slot: string): boolean {
  return SYSTEM_COLUMNS.has(slot);
}

/** introspect で使っている parser を再利用（重複定義を避けたいが循環依存になるのでローカル化） */
function parseChoicesText(text: string): Choice[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: Choice[] = [];
  const seen = new Set<unknown>();

  for (const line of lines) {
    if (line.startsWith('[[') && line.endsWith(']]')) continue;

    const parts = line.split(',');
    let value: number | string;
    let label: string;

    if (parts.length === 1) {
      value = parts[0];
      label = parts[0];
    } else {
      const rawValue = parts[0].trim();
      const numericValue = Number(rawValue);
      value =
        rawValue !== '' && !Number.isNaN(numericValue) ? numericValue : rawValue;
      label = parts[1].trim();
    }

    if (label.length === 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    items.push({ value, label });
  }

  return items;
}

// === plan formatter ===

/**
 * PlanResult を人間向けに整形して文字列化。
 */
export function formatPlan(plan: PlanResult): string {
  const lines: string[] = [];
  let create = 0;
  let update = 0;
  let unchanged = 0;

  for (const diff of plan.models) {
    if (diff.kind === 'unchanged') {
      unchanged += 1;
      lines.push(`= ${diff.modelName} (siteId=${diff.siteId}) — no changes`);
      continue;
    }

    if (diff.kind === 'create') {
      create += 1;
      const fieldCount = Object.keys(diff.model.fields).length;
      lines.push(`+ ${diff.modelName} — create new site`);
      lines.push(`    type: ${diff.model.type}`);
      lines.push(`    parentId: ${diff.model.parentId}`);
      lines.push(`    title: ${diff.model.title}`);
      lines.push(`    fields: ${fieldCount}`);
      continue;
    }

    update += 1;
    lines.push(`~ ${diff.modelName} (siteId=${diff.siteId}) — update`);
    for (const ch of diff.changes) {
      lines.push(`    ${formatChange(ch)}`);
    }
  }

  lines.push('');
  lines.push(
    `Plan: ${create} to create, ${update} to update, ${unchanged} unchanged.`,
  );

  return lines.join('\n') + '\n';
}

function formatChange(ch: Change): string {
  switch (ch.kind) {
    case 'title':
      return `title: ${JSON.stringify(ch.from)} → ${JSON.stringify(ch.to)}`;
    case 'add-column':
      return `+ column ${ch.slot} (${ch.field.type}) "${ch.label}"`;
    case 'update-column-label':
      return `~ column ${ch.slot} label: ${JSON.stringify(ch.from)} → ${JSON.stringify(ch.to)}`;
    case 'update-column-choices':
      return `~ column ${ch.slot} choices: ${ch.from.length} item(s) → ${ch.to.length} item(s)`;
    case 'orphan-column':
      return `(orphan) column ${ch.slot} "${ch.existingLabel}" — exists in Pleasanter but not in schema (ignored)`;
  }
}
