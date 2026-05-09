import { describe, it, expect } from 'vitest';
import { parseSchema } from '../parser.js';

describe('parseSchema', () => {
  it('minimum valid schema を AST に変換する', () => {
    const yaml = `
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客マスタ
    fields:
      code:
        slot: ClassA
        label: 顧客コード
        type: text
`;
    const ast = parseSchema(yaml);

    expect(ast.version).toBe('1');
    expect(ast.models.customer).toBeDefined();
    expect(ast.models.customer.type).toBe('Results');
    expect(ast.models.customer.parentId).toBe(35534);
    expect(ast.models.customer.title).toBe('顧客マスタ');
    expect(ast.models.customer.fields.code).toMatchObject({
      slot: 'ClassA',
      label: '顧客コード',
      type: 'text',
    });
  });

  it('複数 model を扱える', () => {
    const yaml = `
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
    title: 請求書
    fields:
      number: { slot: ClassA, label: 番号, type: text }
`;
    const ast = parseSchema(yaml);

    expect(Object.keys(ast.models)).toEqual(['customer', 'invoice']);
  });

  it('top-level choices を読める', () => {
    const yaml = `
version: '1'
choices:
  CustomerStatus:
    - { value: 100, label: アクティブ }
    - { value: 900, label: 休止 }
models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客
    fields:
      status: { slot: Status, label: 状況, type: status, choices: CustomerStatus }
`;
    const ast = parseSchema(yaml);

    expect(ast.choices?.CustomerStatus).toHaveLength(2);
    expect(ast.choices?.CustomerStatus[0]).toEqual({ value: 100, label: 'アクティブ' });
  });

  it('inline choices も読める', () => {
    const yaml = `
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客
    fields:
      status:
        slot: Status
        label: 状況
        type: status
        choices:
          - { value: 1, label: A }
          - { value: 2, label: B }
`;
    const ast = parseSchema(yaml);
    const status = ast.models.customer.fields.status;
    if (status.type !== 'status') throw new Error('expected status');
    expect(Array.isArray(status.choices)).toBe(true);
    if (Array.isArray(status.choices)) {
      expect(status.choices).toHaveLength(2);
    }
  });

  it('relation field の to を読める', () => {
    const yaml = `
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
`;
    const ast = parseSchema(yaml);
    const customerId = ast.models.invoice.fields.customerId;
    if (customerId.type !== 'relation') throw new Error('expected relation');
    expect(customerId.to).toBe('customer');
  });

  it('server config を読める', () => {
    const yaml = `
version: '1'
server:
  baseUrl: https://example.com
  apiKey: abc
  apiVersion: '1.1'
models: {}
`;
    const ast = parseSchema(yaml);
    expect(ast.server?.baseUrl).toBe('https://example.com');
    expect(ast.server?.apiKey).toBe('abc');
    expect(ast.server?.apiVersion).toBe('1.1');
  });

  it('${ENV_VAR} を server.* で展開する', () => {
    const prev = process.env.PLEASANTER_TEST_BASE_URL;
    process.env.PLEASANTER_TEST_BASE_URL = 'https://from-env.example.com';
    try {
      const yaml = `
version: '1'
server:
  baseUrl: \${PLEASANTER_TEST_BASE_URL}
  apiKey: abc
models: {}
`;
      const ast = parseSchema(yaml);
      expect(ast.server?.baseUrl).toBe('https://from-env.example.com');
    } finally {
      process.env.PLEASANTER_TEST_BASE_URL = prev;
    }
  });

  it('未定義 ${ENV_VAR} はエラー', () => {
    delete process.env.PLEASANTER_NONEXISTENT_42;
    const yaml = `
version: '1'
server:
  baseUrl: \${PLEASANTER_NONEXISTENT_42}
  apiKey: abc
models: {}
`;
    expect(() => parseSchema(yaml)).toThrow(/PLEASANTER_NONEXISTENT_42/);
  });

  it('YAML syntax error は SyntaxError として投げる', () => {
    const yaml = `
version: '1
models:
`;
    expect(() => parseSchema(yaml)).toThrow();
  });

  it('default 値を読める', () => {
    const yaml = `
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客
    fields:
      status: { slot: Status, label: 状況, type: status, choices: [{value: 100, label: A}], default: 100 }
`;
    const ast = parseSchema(yaml);
    expect(ast.models.customer.fields.status.default).toBe(100);
  });

  it('required と unique フラグを読める', () => {
    const yaml = `
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    title: 顧客
    fields:
      code: { slot: ClassA, label: コード, type: text, required: true, unique: true }
`;
    const ast = parseSchema(yaml);
    const code = ast.models.customer.fields.code;
    expect(code.required).toBe(true);
    expect(code.unique).toBe(true);
  });
});
