import type {
  SchemaAst,
  Choice,
  Field,
  ReferenceType,
  ValidationResult,
  ValidationError,
} from './ast.js';

const VALID_REFERENCE_TYPES: ReferenceType[] = [
  'Sites',
  'Issues',
  'Results',
  'Wikis',
];

const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;

interface SlotTypeRule {
  /** 受け入れる slot の prefix（先頭一致） */
  prefixes?: string[];
  /** 受け入れる slot の完全名（exact match） */
  exact?: string[];
}

const SLOT_TYPE_RULES: Record<Field['type'], SlotTypeRule> = {
  text: {
    prefixes: ['Class'],
    exact: ['Title', 'Body', 'Manager', 'Owner'],
  },
  number: { prefixes: ['Num'] },
  datetime: {
    prefixes: ['Date'],
    exact: ['StartTime', 'CompletionTime', 'CreatedTime', 'UpdatedTime'],
  },
  boolean: { prefixes: ['Check'] },
  description: { prefixes: ['Description'] },
  status: { exact: ['Status'] },
  class: { prefixes: ['Class'] },
  check: { prefixes: ['Check'] },
  relation: { prefixes: ['Class'] },
};

/**
 * Schema AST のバリデーション。エラーがあれば全て集めて返す（早期 return しない）。
 */
export function validateSchema(ast: SchemaAst): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. version
  if (ast.version !== '1') {
    errors.push({
      path: 'version',
      code: 'unsupported_version',
      message: `unsupported schema version: '${String(ast.version)}' (must be '1')`,
    });
  }

  // 2. shared choices
  if (ast.choices) {
    for (const [name, list] of Object.entries(ast.choices)) {
      validateChoices(list, `choices.${name}`, errors);
    }
  }

  // 3. models（最低限の構造チェックのみ。型は AST に従う）
  if (typeof ast.models !== 'object' || ast.models === null) {
    errors.push({
      path: 'models',
      code: 'invalid_structure',
      message: 'models must be an object',
    });
    return finalize(ast, errors);
  }

  const modelNames = Object.keys(ast.models);

  for (const [modelName, model] of Object.entries(ast.models)) {
    const modelPath = `models.${modelName}`;

    // model 名 camelCase
    if (!CAMEL_CASE.test(modelName)) {
      errors.push({
        path: modelPath,
        code: 'invalid_camel_case',
        message: `model name '${modelName}' must be camelCase`,
      });
    }

    // ReferenceType
    if (!VALID_REFERENCE_TYPES.includes(model.type)) {
      errors.push({
        path: `${modelPath}.type`,
        code: 'invalid_reference_type',
        message: `invalid type '${String(model.type)}' (must be one of: ${VALID_REFERENCE_TYPES.join(', ')})`,
      });
    }

    // fields
    if (typeof model.fields !== 'object' || model.fields === null) {
      errors.push({
        path: `${modelPath}.fields`,
        code: 'invalid_structure',
        message: 'fields must be an object',
      });
      continue;
    }

    const usedSlots = new Set<string>();

    for (const [fieldName, field] of Object.entries(model.fields)) {
      const fieldPath = `${modelPath}.fields.${fieldName}`;

      // field 名 camelCase
      if (!CAMEL_CASE.test(fieldName)) {
        errors.push({
          path: fieldPath,
          code: 'invalid_camel_case',
          message: `field name '${fieldName}' must be camelCase`,
        });
      }

      // slot duplication（型に slot があることを期待）
      const slot = (field as { slot?: unknown }).slot;
      if (typeof slot === 'string') {
        if (usedSlots.has(slot)) {
          errors.push({
            path: fieldPath,
            code: 'duplicate_slot',
            message: `duplicate slot '${slot}' in model ${modelName}`,
          });
        } else {
          usedSlots.add(slot);
        }

        // slot vs type 整合
        const rule = SLOT_TYPE_RULES[field.type];
        if (rule && !slotMatchesRule(slot, rule)) {
          errors.push({
            path: fieldPath,
            code: 'slot_type_mismatch',
            message: `type '${field.type}' is incompatible with slot '${slot}'${formatRuleHint(rule)}`,
          });
        }
      }

      // status / class: choices
      if (field.type === 'status' || field.type === 'class') {
        const choices = (field as { choices?: unknown }).choices;
        if (typeof choices === 'string') {
          if (!ast.choices || !(choices in ast.choices)) {
            errors.push({
              path: `${fieldPath}.choices`,
              code: 'unknown_choices_ref',
              message: `unknown choices reference '${choices}'`,
            });
          }
        } else if (Array.isArray(choices)) {
          validateChoices(choices, `${fieldPath}.choices`, errors);
        } else if (choices === undefined) {
          errors.push({
            path: `${fieldPath}.choices`,
            code: 'invalid_structure',
            message: `type '${field.type}' requires 'choices'`,
          });
        }
      }

      // relation: to
      if (field.type === 'relation') {
        const to = (field as { to?: unknown }).to;
        if (typeof to !== 'string') {
          errors.push({
            path: fieldPath,
            code: 'missing_relation_target',
            message: "relation field is missing 'to'",
          });
        } else if (!modelNames.includes(to)) {
          errors.push({
            path: `${fieldPath}.to`,
            code: 'unknown_relation_target',
            message: `unknown model '${to}' referenced from ${fieldName}`,
          });
        }
      }
    }
  }

  return finalize(ast, errors);
}

function finalize(ast: SchemaAst, errors: ValidationError[]): ValidationResult {
  if (errors.length === 0) {
    return { ok: true, ast };
  }
  return { ok: false, errors };
}

function validateChoices(
  list: unknown,
  basePath: string,
  errors: ValidationError[],
): void {
  if (!Array.isArray(list)) {
    errors.push({
      path: basePath,
      code: 'invalid_structure',
      message: 'choices must be an array',
    });
    return;
  }

  const seenValues = new Set<unknown>();

  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i] as unknown;
    const entryPath = `${basePath}[${i}]`;

    if (typeof entry !== 'object' || entry === null) {
      errors.push({
        path: entryPath,
        code: 'invalid_choice_entry',
        message: 'choice entry must be an object with value and label',
      });
      continue;
    }

    const e = entry as Partial<Choice>;
    if (e.value === undefined) {
      errors.push({
        path: entryPath,
        code: 'invalid_choice_entry',
        message: "choice missing 'value' field",
      });
    } else if (typeof e.value !== 'number' && typeof e.value !== 'string') {
      errors.push({
        path: entryPath,
        code: 'invalid_choice_entry',
        message: "'value' must be a number or string",
      });
    } else if (seenValues.has(e.value)) {
      errors.push({
        path: entryPath,
        code: 'duplicate_choice_value',
        message: `duplicate choice value ${JSON.stringify(e.value)}`,
      });
    } else {
      seenValues.add(e.value);
    }

    if (typeof e.label !== 'string' || e.label.length === 0) {
      errors.push({
        path: entryPath,
        code: 'invalid_choice_entry',
        message: "'label' must be a non-empty string",
      });
    }
  }
}

function slotMatchesRule(slot: string, rule: SlotTypeRule): boolean {
  if (rule.exact?.includes(slot)) return true;
  if (rule.prefixes?.some((p) => slot.startsWith(p) && slot !== p)) return true;
  // prefix === slot のケース（例: "Class" 単体）は許可しない（"ClassA" 形式必須）
  return false;
}

function formatRuleHint(rule: SlotTypeRule): string {
  const parts: string[] = [];
  if (rule.prefixes && rule.prefixes.length > 0) {
    parts.push(`prefix: ${rule.prefixes.map((p) => p + '*').join(' / ')}`);
  }
  if (rule.exact && rule.exact.length > 0) {
    parts.push(`exact: ${rule.exact.join(' / ')}`);
  }
  return parts.length > 0 ? ` (allowed ${parts.join(', ')})` : '';
}
