import { describe, it, expect } from 'vitest';
import { parseSchema, validateSchema } from '@pleasync/schema';
import { generateClient } from '../generate.js';

function generate(yaml: string): string {
  const ast = parseSchema(yaml);
  const result = validateSchema(ast);
  if (!result.ok) {
    throw new Error(
      `schema invalid:\n${result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
    );
  }
  return generateClient(result.ast, { schemaPath: 'test.yaml' });
}

describe('generateClient', () => {
  it('最小 schema から PleasyncClient が生成される', () => {
    const code = generate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    siteId: 35535
    title: 顧客
    fields:
      code: { slot: ClassA, label: コード, type: text }
`);

    expect(code).toContain("import { Engine, ModelCollection } from '@pleasync/orm'");
    expect(code).toContain('WhereOperator');
    expect(code).toContain('OrderByDirection');
    expect(code).toContain('export interface CustomerRecord');
    expect(code).toContain('export interface CustomerCreateInput');
    expect(code).toContain('export interface CustomerUpdateInput');
    expect(code).toContain('export interface CustomerWhere');
    expect(code).toContain('export interface CustomerOrderBy');
    expect(code).toContain('class CustomerCollection extends ModelCollection<');
    expect(code).toContain('export class PleasyncClient');
    expect(code).toContain('readonly customer: CustomerCollection');
  });

  it('Where field は WhereOperator<T> でラップされる', () => {
    const code = generate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    siteId: 100
    title: 顧客
    fields:
      code: { slot: ClassA, label: c, type: text }
      status:
        slot: Status
        label: s
        type: status
        choices: [{ value: 100, label: A }, { value: 900, label: B }]
`);

    expect(code).toMatch(/code\?: WhereOperator<string>;/);
    expect(code).toMatch(/status\?: WhereOperator<100 \| 900>;/);
    expect(code).toMatch(/id\?: WhereOperator<number>;/);
  });

  it('OrderBy 型は全 field + id を OrderByDirection で持つ', () => {
    const code = generate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      a: { slot: ClassA, label: a, type: text }
      b: { slot: ClassB, label: b, type: text }
`);

    const block = code.match(/export interface MOrderBy \{[\s\S]*?\}/)![0];
    expect(block).toMatch(/id\?: OrderByDirection;/);
    expect(block).toMatch(/a\?: OrderByDirection;/);
    expect(block).toMatch(/b\?: OrderByDirection;/);
  });

  it('Collection は型パラメータに OrderBy / Include を順に渡す', () => {
    const code = generate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    siteId: 100
    title: 顧客
    fields:
      code: { slot: ClassA, label: c, type: text }
`);

    expect(code).toMatch(/CustomerWhere,\s+CustomerOrderBy,\s+CustomerInclude/);
  });

  describe('relation include', () => {
    const SCHEMA_WITH_RELATION = `
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    siteId: 100
    title: 顧客
    fields:
      code: { slot: ClassA, label: コード, type: text }
  invoice:
    type: Results
    parentId: 1
    siteId: 200
    title: 請求書
    fields:
      number: { slot: ClassA, label: 番号, type: text }
      customerId: { slot: ClassB, label: 顧客, type: relation, to: customer }
`;

    it('Include type に relation field のみ列挙', () => {
      const code = generate(SCHEMA_WITH_RELATION);

      const m = code.match(/export interface InvoiceInclude \{[\s\S]*?\}/);
      expect(m).toBeTruthy();
      const block = m![0];
      expect(block).toMatch(/customerId\?: boolean;/);
      // number は relation じゃないので含まれない
      expect(block).not.toMatch(/number\?:/);
    });

    it('relation field の Record 型は number | <Target>Record 型', () => {
      const code = generate(SCHEMA_WITH_RELATION);

      const m = code.match(/export interface InvoiceRecord \{[\s\S]*?\}/);
      expect(m).toBeTruthy();
      const block = m![0];
      expect(block).toMatch(/customerId: number \| CustomerRecord;/);
    });

    it('fieldMap に targetModel が埋め込まれる', () => {
      const code = generate(SCHEMA_WITH_RELATION);
      expect(code).toMatch(
        /customerId: \{ slot: "ClassB", type: "relation", targetModel: "customer" \}/,
      );
    });

    it('relation 無しモデルの Include は空インターフェース風', () => {
      const code = generate(SCHEMA_WITH_RELATION);
      const m = code.match(/export interface CustomerInclude \{[\s\S]*?\}/);
      expect(m).toBeTruthy();
      const block = m![0];
      expect(block).toMatch(/no relation fields/);
    });

    it('PleasyncClient が ClientLike を実装し __resolveCollection を持つ', () => {
      const code = generate(SCHEMA_WITH_RELATION);
      expect(code).toMatch(/export class PleasyncClient implements ClientLike/);
      expect(code).toMatch(/__resolveCollection\(name: string\)/);
      expect(code).toMatch(/case "customer": return this\.customer/);
      expect(code).toMatch(/case "invoice": return this\.invoice/);
    });

    it('Collection 初期化で this を渡す (ClientLike として)', () => {
      const code = generate(SCHEMA_WITH_RELATION);
      expect(code).toMatch(
        /this\.customer = new CustomerCollection\(engine, this\);/,
      );
      expect(code).toMatch(
        /this\.invoice = new InvoiceCollection\(engine, this\);/,
      );
    });
  });

  it('field type ごとに正しい TS 型を生成', () => {
    const code = generate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      txt:  { slot: ClassA, label: x, type: text }
      n:    { slot: NumA, label: x, type: number }
      d:    { slot: DateA, label: x, type: datetime }
      b:    { slot: CheckA, label: x, type: boolean }
      desc: { slot: DescriptionA, label: x, type: description }
      ch:   { slot: CheckB, label: x, type: check }
`);

    expect(code).toMatch(/txt: string;/);
    expect(code).toMatch(/n: number;/);
    expect(code).toMatch(/d: Date \| string;/);
    expect(code).toMatch(/b: boolean;/);
    expect(code).toMatch(/desc: string;/);
    expect(code).toMatch(/ch: boolean;/);
  });

  it('inline choices → value union 型', () => {
    const code = generate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      status:
        slot: Status
        label: x
        type: status
        choices:
          - { value: 100, label: A }
          - { value: 900, label: B }
`);

    expect(code).toMatch(/status: 100 \| 900;/);
  });

  it('shared choices → 名前付き型として参照', () => {
    const code = generate(`
version: '1'
choices:
  CustomerStatus:
    - { value: 100, label: A }
    - { value: 900, label: B }
models:
  m:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      status:
        slot: Status
        label: x
        type: status
        choices: CustomerStatus
`);

    expect(code).toMatch(/export type CustomerStatus = 100 \| 900;/);
    expect(code).toMatch(/status: CustomerStatus;/);
  });

  it('required field は CreateInput で必須', () => {
    const code = generate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      a: { slot: ClassA, label: a, type: text, required: true }
      b: { slot: ClassB, label: b, type: text }
`);

    // CreateInput 内の a は required, b は optional
    const m = code.match(/export interface MCreateInput \{[\s\S]*?\}/);
    expect(m).toBeTruthy();
    const block = m![0];
    expect(block).toMatch(/a: string;/);
    expect(block).toMatch(/b\?: string;/);
  });

  it('UpdateInput は全部 optional', () => {
    const code = generate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      a: { slot: ClassA, label: a, type: text, required: true }
      b: { slot: ClassB, label: b, type: text }
`);

    const m = code.match(/export interface MUpdateInput \{[\s\S]*?\}/);
    expect(m).toBeTruthy();
    const block = m![0];
    expect(block).toMatch(/a\?: string;/);
    expect(block).toMatch(/b\?: string;/);
  });

  it('relation field の Record 型は number | <Target>Record', () => {
    const code = generate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    siteId: 100
    title: Customer
    fields:
      code: { slot: ClassA, label: c, type: text }
  invoice:
    type: Results
    parentId: 1
    siteId: 101
    title: Invoice
    fields:
      customerId: { slot: ClassA, label: c, type: relation, to: customer }
`);

    expect(code).toMatch(/customerId: number \| CustomerRecord;/);
  });

  it('siteId 省略時はプレースホルダコメント付き 0', () => {
    const code = generate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    title: M
    fields:
      a: { slot: ClassA, label: a, type: text }
`);

    expect(code).toMatch(/MISSING siteId/);
    expect(code).toMatch(/siteId: \/\* MISSING siteId.*\*\/ 0/);
  });

  it('複数 model が PleasyncClient のフィールドに登録される', () => {
    const code = generate(`
version: '1'
models:
  customer:
    type: Results
    parentId: 1
    siteId: 100
    title: A
    fields:
      code: { slot: ClassA, label: a, type: text }
  invoice:
    type: Results
    parentId: 1
    siteId: 101
    title: B
    fields:
      number: { slot: ClassA, label: b, type: text }
`);

    expect(code).toMatch(/readonly customer: CustomerCollection/);
    expect(code).toMatch(/readonly invoice: InvoiceCollection/);
    expect(code).toMatch(
      /this\.customer = new CustomerCollection\(engine, this\);/,
    );
    expect(code).toMatch(
      /this\.invoice = new InvoiceCollection\(engine, this\);/,
    );
  });

  it('生成コードに AUTO-GENERATED ヘッダ', () => {
    const code = generate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      a: { slot: ClassA, label: a, type: text }
`);

    expect(code).toMatch(/AUTO-GENERATED/);
  });

  it('ClassA に type: class + choices で union 生成', () => {
    const code = generate(`
version: '1'
models:
  m:
    type: Results
    parentId: 1
    siteId: 100
    title: M
    fields:
      cat:
        slot: ClassA
        label: x
        type: class
        choices:
          - { value: '1', label: A }
          - { value: '2', label: B }
`);

    expect(code).toMatch(/cat: "1" \| "2";/);
  });
});
