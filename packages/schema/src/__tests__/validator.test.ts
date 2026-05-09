import { describe, it, expect } from 'vitest';
import { parseSchema } from '../parser.js';
import { validateSchema } from '../validator.js';
import type { SchemaAst } from '../ast.js';

function validate(yaml: string) {
  return validateSchema(parseSchema(yaml));
}

describe('validateSchema', () => {
  describe('happy path', () => {
    it('正しい schema は ok=true', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客
    fields:
      code: { slot: ClassA, label: コード, type: text }
`);
      expect(result.ok).toBe(true);
    });

    it('複数 model + relation でも ok', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客
    fields:
      code: { slot: ClassA, label: コード, type: text }
  invoice:
    type: Results
    parentId: 35534
    title: 請求
    fields:
      customerId: { slot: ClassA, label: 顧客, type: relation, to: customer }
`);
      expect(result.ok).toBe(true);
    });

    it('共有 choices 参照と inline choices どちらも ok', () => {
      const result = validate(`
version: '1'
choices:
  Status:
    - { value: 100, label: A }
    - { value: 200, label: B }
models:
  m1:
    type: Results
    parentId: 1
    title: A
    fields:
      s: { slot: Status, label: S, type: status, choices: Status }
  m2:
    type: Results
    parentId: 1
    title: B
    fields:
      s:
        slot: Status
        label: S
        type: status
        choices:
          - { value: 1, label: X }
          - { value: 2, label: Y }
`);
      expect(result.ok).toBe(true);
    });
  });

  describe('version', () => {
    it("version が '1' でない → unsupported_version", () => {
      const ast: SchemaAst = { version: '2' as never, models: {} };
      const result = validateSchema(ast);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].code).toBe('unsupported_version');
      }
    });
  });

  describe('camelCase', () => {
    it('model 名が camelCase でない → invalid_camel_case', () => {
      const result = validate(`
version: '1'
models:
  Customer:
    type: Results
    parentId: 1
    title: A
    fields:
      code: { slot: ClassA, label: c, type: text }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'invalid_camel_case')).toBe(true);
      }
    });

    it('field 名が camelCase でない → invalid_camel_case', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    title: A
    fields:
      MyCode: { slot: ClassA, label: c, type: text }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'invalid_camel_case')).toBe(true);
      }
    });

    it('snake_case はエラー', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    title: A
    fields:
      my_code: { slot: ClassA, label: c, type: text }
`);
      expect(result.ok).toBe(false);
    });
  });

  describe('slot duplication', () => {
    it('同じ model 内で同じ slot を 2 回 → duplicate_slot', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    title: A
    fields:
      a: { slot: ClassA, label: a, type: text }
      b: { slot: ClassA, label: b, type: text }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'duplicate_slot')).toBe(true);
      }
    });

    it('別 model 間で同じ slot を使うのは ok', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    title: A
    fields:
      code: { slot: ClassA, label: c, type: text }
  invoice:
    type: Results
    parentId: 1
    title: B
    fields:
      number: { slot: ClassA, label: n, type: text }
`);
      expect(result.ok).toBe(true);
    });
  });

  describe('slot type compatibility', () => {
    it('type=number に ClassA → slot_type_mismatch', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    title: A
    fields:
      n: { slot: ClassA, label: n, type: number }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'slot_type_mismatch')).toBe(true);
      }
    });

    it('type=number + NumA → ok', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    title: A
    fields:
      n: { slot: NumA, label: n, type: number }
`);
      expect(result.ok).toBe(true);
    });

    it('type=status + ClassA → slot_type_mismatch (Status のみ可)', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    title: A
    fields:
      s: { slot: ClassA, label: s, type: status, choices: [{value: 1, label: A}] }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'slot_type_mismatch')).toBe(true);
      }
    });

    it('type=datetime + StartTime → ok', () => {
      const result = validate(`
version: '1'
models:
  issue:
    type: Issues
    parentId: 1
    title: A
    fields:
      sd: { slot: StartTime, label: 開始, type: datetime }
`);
      expect(result.ok).toBe(true);
    });

    it('type=text + Title → ok', () => {
      const result = validate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    title: A
    fields:
      t: { slot: Title, label: タイトル, type: text }
`);
      expect(result.ok).toBe(true);
    });
  });

  describe('choices', () => {
    it('未定義の choices 参照 → unknown_choices_ref', () => {
      const result = validate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    title: A
    fields:
      s: { slot: Status, label: s, type: status, choices: NotDefined }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'unknown_choices_ref')).toBe(true);
      }
    });

    it('共有 choices 内の value 重複 → duplicate_choice_value', () => {
      const result = validate(`
version: '1'
choices:
  Bad:
    - { value: 1, label: A }
    - { value: 1, label: B }
models: {}
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'duplicate_choice_value')).toBe(true);
      }
    });

    it('inline choices 内の value 重複 → duplicate_choice_value', () => {
      const result = validate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    title: A
    fields:
      s:
        slot: Status
        label: s
        type: status
        choices:
          - { value: 1, label: A }
          - { value: 1, label: B }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'duplicate_choice_value')).toBe(true);
      }
    });

    it('choice の value/label 欠落 → invalid_choice_entry', () => {
      const result = validate(`
version: '1'
choices:
  Bad:
    - { value: 1 }
models: {}
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'invalid_choice_entry')).toBe(true);
      }
    });
  });

  describe('relation', () => {
    it('to が未定義の model を指す → unknown_relation_target', () => {
      const result = validate(`
version: '1'
models:
  invoice:
    type: Results
    parentId: 1
    title: A
    fields:
      customerId: { slot: ClassA, label: c, type: relation, to: customer }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'unknown_relation_target')).toBe(
          true,
        );
      }
    });

    it('to が省略 → missing_relation_target', () => {
      // raw YAML から to を欠落させる
      const result = validateSchema({
        version: '1',
        models: {
          invoice: {
            type: 'Results',
            parentId: 1,
            title: 'A',
            fields: {
              customerId: {
                slot: 'ClassA',
                label: 'c',
                type: 'relation',
              } as never,
            },
          },
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === 'missing_relation_target')).toBe(
          true,
        );
      }
    });
  });

  describe('reference type', () => {
    it('未対応の type → invalid_reference_type', () => {
      const result = validateSchema({
        version: '1',
        models: {
          m: {
            type: 'Folder' as never,
            parentId: 1,
            title: 'A',
            fields: {},
          },
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some((e) => e.code === 'invalid_reference_type'),
        ).toBe(true);
      }
    });
  });

  describe('multiple errors', () => {
    it('すべてのエラーを集めて返す（早期 return しない）', () => {
      const result = validate(`
version: '1'
models:
  Customer:
    type: Results
    parentId: 1
    title: A
    fields:
      a: { slot: ClassA, label: a, type: number }
      b: { slot: ClassA, label: b, type: text }
`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Customer (camelCase 違反) + ClassA で number (slot_type_mismatch) + ClassA 重複 (duplicate_slot)
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
