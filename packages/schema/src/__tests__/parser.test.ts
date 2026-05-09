import { describe, it, expect } from 'vitest';
import { parseSchema, resolveServerConfig } from '../parser.js';

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

  it('${ENV_VAR} はパース時には展開せずリテラルとして残す', () => {
    const yaml = `
version: '1'
server:
  baseUrl: \${PLEASANTER_TEST_BASE_URL}
  apiKey: abc
models: {}
`;
    const ast = parseSchema(yaml);
    // env 展開しない（環境変数が未定義でも throw しない）
    expect(ast.server?.baseUrl).toBe('${PLEASANTER_TEST_BASE_URL}');
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

describe('resolveServerConfig', () => {
  it('${ENV_VAR} を process.env から展開', () => {
    const prev = process.env.PLEASANTER_TEST_BASE_URL;
    process.env.PLEASANTER_TEST_BASE_URL = 'https://from-env.example.com';
    try {
      const resolved = resolveServerConfig({
        baseUrl: '${PLEASANTER_TEST_BASE_URL}',
        apiKey: 'abc',
      });
      expect(resolved.baseUrl).toBe('https://from-env.example.com');
      expect(resolved.apiKey).toBe('abc');
    } finally {
      process.env.PLEASANTER_TEST_BASE_URL = prev;
    }
  });

  it('未定義 ${ENV_VAR} は throw', () => {
    delete process.env.PLEASANTER_NONEXISTENT_42;
    expect(() =>
      resolveServerConfig({
        baseUrl: '${PLEASANTER_NONEXISTENT_42}',
        apiKey: 'abc',
      }),
    ).toThrow(/PLEASANTER_NONEXISTENT_42/);
  });

  it('apiVersion も展開できる', () => {
    process.env.PLEASANTER_TEST_VER = '2.0';
    try {
      const resolved = resolveServerConfig({
        baseUrl: 'http://x',
        apiKey: 'abc',
        apiVersion: '${PLEASANTER_TEST_VER}',
      });
      expect(resolved.apiVersion).toBe('2.0');
    } finally {
      delete process.env.PLEASANTER_TEST_VER;
    }
  });

  it('apiVersion 未指定時は undefined のまま', () => {
    const resolved = resolveServerConfig({
      baseUrl: 'http://x',
      apiKey: 'abc',
    });
    expect(resolved.apiVersion).toBeUndefined();
  });
});
