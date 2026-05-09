import type { FieldRuntimeDef, FieldRuntimeType, ModelDef } from './types.js';

/**
 * Pleasanter API の record の Hash プレフィックス。
 *
 * 例: `ClassA` の値は record["ClassHash"]["ClassA"] にある。
 * `Status` / `Title` 等の標準カラムは hash ではなく直接 record["Status"] にある。
 */
type HashKey =
  | 'ClassHash'
  | 'NumHash'
  | 'DateHash'
  | 'CheckHash'
  | 'DescriptionHash';

/** slot がどの Hash に格納されるか判定（直接カラムなら null） */
function hashKeyForSlot(slot: string): HashKey | null {
  if (slot.startsWith('Class')) return 'ClassHash';
  if (slot.startsWith('Num')) return 'NumHash';
  if (slot.startsWith('Date')) return 'DateHash';
  if (slot.startsWith('Check')) return 'CheckHash';
  if (slot.startsWith('Description')) return 'DescriptionHash';
  return null;
}

/**
 * logical name → Pleasanter API payload (create/update 用)。
 *
 * 例: `{ code: 'C-001', name: 'foo', status: 100 }` (logical)
 *   → `{ ClassHash: { ClassA: 'C-001', ClassB: 'foo' }, Status: 100 }`
 */
export function toApiPayload(
  data: Record<string, unknown>,
  modelDef: ModelDef,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [logicalName, value] of Object.entries(data)) {
    const fieldDef = modelDef.fieldMap[logicalName];
    if (!fieldDef) {
      throw new Error(`unknown field: '${logicalName}'`);
    }

    const slot = fieldDef.slot;
    const hashKey = hashKeyForSlot(slot);

    if (hashKey === null) {
      // 直接カラム（Status, Title, Body, StartTime など）
      payload[slot] = encodeValue(value, fieldDef.type);
    } else {
      // Hash カラム
      const hash = (payload[hashKey] as Record<string, unknown> | undefined) ?? {};
      hash[slot] = encodeValue(value, fieldDef.type);
      payload[hashKey] = hash;
    }
  }

  return payload;
}

/**
 * Pleasanter API record → logical name の record。
 *
 * 例: `{ ResultId: 1, ClassHash: { ClassA: 'C-001' }, Status: 100, ... }` (raw)
 *   → `{ id: 1, code: 'C-001', status: 100 }` (logical)
 */
export function fromApiRecord(
  raw: Record<string, unknown>,
  modelDef: ModelDef,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // id: ReferenceType ごとに ResultId / IssueId を統一
  result.id = extractId(raw, modelDef.type);

  // 標準的なシステムフィールド
  if (raw.CreatedTime !== undefined) {
    result.createdAt = decodeDate(raw.CreatedTime);
  }
  if (raw.UpdatedTime !== undefined) {
    result.updatedAt = decodeDate(raw.UpdatedTime);
  }

  // logical name で定義された field を引き出す
  for (const [logicalName, fieldDef] of Object.entries(modelDef.fieldMap)) {
    const slot = fieldDef.slot;
    const hashKey = hashKeyForSlot(slot);
    let raw_value: unknown;

    if (hashKey === null) {
      raw_value = raw[slot];
    } else {
      const hash = raw[hashKey] as Record<string, unknown> | undefined;
      raw_value = hash?.[slot];
    }

    if (raw_value !== undefined) {
      result[logicalName] = decodeValue(raw_value, fieldDef.type);
    }
  }

  return result;
}

/** raw record から id を取得（type ごとに違う slot に格納されている） */
function extractId(
  raw: Record<string, unknown>,
  type: ModelDef['type'],
): number {
  switch (type) {
    case 'Issues':
      return Number(raw.IssueId);
    case 'Results':
      return Number(raw.ResultId);
    case 'Wikis':
      return Number(raw.WikiId);
    case 'Sites':
      return Number(raw.SiteId);
  }
}

/** logical → Pleasanter wire format */
function encodeValue(value: unknown, type: FieldRuntimeType): unknown {
  if (value === null || value === undefined) return value;
  switch (type) {
    case 'datetime':
      // Date → ISO string
      if (value instanceof Date) return value.toISOString();
      return value;
    case 'boolean':
    case 'check':
      return Boolean(value);
    case 'number':
      return Number(value);
    default:
      // text, status, class, description, relation はそのまま
      return value;
  }
}

/** Pleasanter wire format → logical */
function decodeValue(value: unknown, type: FieldRuntimeType): unknown {
  if (value === null || value === undefined) return value;
  switch (type) {
    case 'datetime':
      return decodeDate(value);
    case 'boolean':
    case 'check':
      return Boolean(value);
    case 'number':
      return typeof value === 'number' ? value : Number(value);
    default:
      return value;
  }
}

function decodeDate(value: unknown): Date | string {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  }
  return String(value);
}
