// Pleasanter の getSite レスポンスを SchemaAst の Model にマッピングする。

import type { Choice, Field, Model, ReferenceType, SchemaAst } from '@pleasync/schema';

/** getSite が返す raw レスポンス（必要なフィールドのみ） */
export interface RawSite {
  SiteId?: number | string;
  Title?: string;
  ReferenceType?: string;
  ParentId?: number;
  SiteSettings?: {
    Columns?: RawColumn[];
  };
}

interface RawColumn {
  ColumnName?: string;
  LabelText?: string;
  ChoicesText?: string;
}

export interface IntrospectOptions {
  /** 生成する model の logical name（省略時は site title から推測） */
  modelName?: string;
}

/** Pleasanter の getSite レスポンスから 1 model 分の Model 定義を構築 */
export function siteToModel(
  raw: RawSite,
  _options: IntrospectOptions = {},
): { name: string; model: Model } {
  if (!raw.SiteId) {
    throw new Error('site response is missing SiteId');
  }
  const siteId = Number(raw.SiteId);

  const refType = (raw.ReferenceType ?? 'Sites') as ReferenceType;
  if (!isValidReferenceType(refType)) {
    throw new Error(`unsupported ReferenceType: ${String(raw.ReferenceType)}`);
  }

  const title = raw.Title ?? `site-${siteId}`;
  const modelName = _options.modelName ?? toCamelCase(title) ?? `site${siteId}`;
  const parentId = typeof raw.ParentId === 'number' ? raw.ParentId : 0;

  const columns = raw.SiteSettings?.Columns ?? [];
  const fields: Record<string, Field> = {};

  for (const col of columns) {
    const colName = col.ColumnName;
    if (!colName) continue;

    const fieldType = detectFieldType(colName, col.ChoicesText);
    if (fieldType === null) continue; // skip unsupported (Comments など)

    const fieldName = toCamelCase(colName) ?? colName;
    const label = col.LabelText && col.LabelText.length > 0 ? col.LabelText : colName;

    const baseField = {
      slot: colName,
      label,
    };

    if (fieldType === 'status' || fieldType === 'class') {
      const choices = parseChoicesText(col.ChoicesText ?? '');
      if (choices.length === 0) {
        // choices が無い class カラムは text 扱いに fallback
        fields[fieldName] = { ...baseField, type: 'text' };
      } else {
        fields[fieldName] = { ...baseField, type: fieldType, choices };
      }
    } else {
      fields[fieldName] = { ...baseField, type: fieldType };
    }
  }

  return {
    name: modelName,
    model: {
      type: refType,
      parentId,
      siteId,
      title,
      fields,
    },
  };
}

/** 複数 site から SchemaAst を構築 */
export function sitesToSchema(sites: RawSite[]): SchemaAst {
  const models: Record<string, Model> = {};
  for (const site of sites) {
    const { name, model } = siteToModel(site);
    let unique = name;
    let i = 2;
    while (unique in models) {
      unique = `${name}${i}`;
      i += 1;
    }
    models[unique] = model;
  }
  return { version: '1', models };
}

// === helpers ===

function isValidReferenceType(t: string): t is ReferenceType {
  return t === 'Sites' || t === 'Issues' || t === 'Results' || t === 'Wikis';
}

/**
 * introspect で出力可能な type のみ（relation は推定できないので除外）。
 */
type IntrospectableFieldType = Exclude<Field['type'], 'relation'>;

/**
 * Pleasanter の ColumnName から logical な type を推定。
 * 不明なものは null（schema から除外）。
 *
 * relation は Pleasanter の Link 機能を ChoicesText の `[[SiteId]]` から
 * 推測する必要があるが、introspect では「未知の参照先 model 名」を生成できないため
 * MVP ではサポート外。Link が見つかった場合は class または text に fallback。
 */
function detectFieldType(
  columnName: string,
  choicesText: string | undefined,
): IntrospectableFieldType | null {
  if (columnName === 'Status') return 'status';
  if (columnName === 'Title' || columnName === 'Body') return 'text';
  if (columnName === 'Manager' || columnName === 'Owner') return 'text';

  if (columnName.startsWith('Class')) {
    return choicesText && choicesText.trim().length > 0 ? 'class' : 'text';
  }
  if (columnName.startsWith('Num')) return 'number';
  if (columnName.startsWith('Date')) return 'datetime';
  if (columnName.startsWith('Description')) return 'description';
  if (columnName.startsWith('Check')) return 'check';

  if (
    columnName === 'StartTime' ||
    columnName === 'CompletionTime' ||
    columnName === 'CreatedTime' ||
    columnName === 'UpdatedTime'
  ) {
    return 'datetime';
  }

  // IssueId/ResultId/WikiId は schema には書かない（id 抽象化で隠蔽）
  // Comments, Creator, Updator, Ver, Guid 等はスキップ
  return null;
}

/**
 * Pleasanter の ChoicesText を { value, label } の配列に変換。
 *
 * フォーマット（行ごと）:
 *   1列: "label"
 *   2列: "value,label"
 *   3列+: "value,label,..." (3 列目以降は無視)
 */
export function parseChoicesText(text: string): Choice[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: Choice[] = [];
  const seen = new Set<unknown>();

  for (const line of lines) {
    // [[SiteId]] 形式の参照は無視
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

/**
 * 任意の文字列を camelCase の identifier に変換。
 * 失敗（数字始まりや非英数字のみ）したら null。
 */
function toCamelCase(input: string): string | null {
  // 英数字以外を区切りとして扱う（日本語タイトル等は識別子に変換不可）
  const stripped = input
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();
  if (stripped.length === 0) return null;

  const words = stripped.split(/\s+/);
  const head = words[0];
  if (!/^[A-Za-z]/.test(head)) return null;

  const camel =
    head.charAt(0).toLowerCase() +
    head.slice(1) +
    words
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');

  // 全部 lower がベターな場合、さらに ASCII identifier として有効か確認
  if (!/^[a-z][a-zA-Z0-9]*$/.test(camel)) return null;
  return camel;
}
