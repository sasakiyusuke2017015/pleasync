import { describe, it, expect } from 'vitest';
import { toApiPayload, fromApiRecord } from '../transform.js';
import type { ModelDef } from '../types.js';

const customerDef: ModelDef = {
  type: 'Results',
  parentId: 1,
  siteId: 100,
  fieldMap: {
    code: { slot: 'ClassA', type: 'text' },
    name: { slot: 'ClassB', type: 'text' },
    age: { slot: 'NumA', type: 'number' },
    birthdate: { slot: 'DateA', type: 'datetime' },
    isVip: { slot: 'CheckA', type: 'boolean' },
    bio: { slot: 'DescriptionA', type: 'description' },
    status: { slot: 'Status', type: 'status' },
    title: { slot: 'Title', type: 'text' },
  },
};

describe('toApiPayload', () => {
  it('ClassA → ClassHash', () => {
    const payload = toApiPayload({ code: 'C-001' }, customerDef);
    expect(payload).toEqual({ ClassHash: { ClassA: 'C-001' } });
  });

  it('NumA → NumHash', () => {
    const payload = toApiPayload({ age: 30 }, customerDef);
    expect(payload).toEqual({ NumHash: { NumA: 30 } });
  });

  it('CheckA → CheckHash with boolean', () => {
    const payload = toApiPayload({ isVip: true }, customerDef);
    expect(payload).toEqual({ CheckHash: { CheckA: true } });
  });

  it('DescriptionA → DescriptionHash', () => {
    const payload = toApiPayload({ bio: 'long text' }, customerDef);
    expect(payload).toEqual({ DescriptionHash: { DescriptionA: 'long text' } });
  });

  it('Status は直接カラム', () => {
    const payload = toApiPayload({ status: 100 }, customerDef);
    expect(payload).toEqual({ Status: 100 });
  });

  it('Title は直接カラム', () => {
    const payload = toApiPayload({ title: 'タイトル' }, customerDef);
    expect(payload).toEqual({ Title: 'タイトル' });
  });

  it('複数 field を mix', () => {
    const payload = toApiPayload(
      { code: 'C-001', name: 'foo', age: 30, status: 100 },
      customerDef,
    );
    expect(payload).toEqual({
      ClassHash: { ClassA: 'C-001', ClassB: 'foo' },
      NumHash: { NumA: 30 },
      Status: 100,
    });
  });

  it('Date オブジェクトは ISO string に変換', () => {
    const date = new Date('2026-05-09T12:00:00.000Z');
    const payload = toApiPayload({ birthdate: date }, customerDef);
    expect(payload).toEqual({ DateHash: { DateA: '2026-05-09T12:00:00.000Z' } });
  });

  it('数値文字列は number に変換', () => {
    const payload = toApiPayload({ age: '30' as unknown as number }, customerDef);
    expect(payload).toEqual({ NumHash: { NumA: 30 } });
  });

  it('未定義 field は throw', () => {
    expect(() => toApiPayload({ unknown: 'x' }, customerDef)).toThrow(/unknown field/);
  });

  it('null/undefined はそのまま渡す', () => {
    const payload = toApiPayload({ code: null }, customerDef);
    expect(payload).toEqual({ ClassHash: { ClassA: null } });
  });
});

describe('fromApiRecord', () => {
  it('Results → id は ResultId', () => {
    const result = fromApiRecord({ ResultId: 42 }, customerDef);
    expect(result.id).toBe(42);
  });

  it('Issues → id は IssueId', () => {
    const issuesDef: ModelDef = {
      ...customerDef,
      type: 'Issues',
    };
    const result = fromApiRecord({ IssueId: 99 }, issuesDef);
    expect(result.id).toBe(99);
  });

  it('Wikis → id は WikiId', () => {
    const wikisDef: ModelDef = { ...customerDef, type: 'Wikis' };
    const result = fromApiRecord({ WikiId: 7 }, wikisDef);
    expect(result.id).toBe(7);
  });

  it('Sites → id は SiteId', () => {
    const sitesDef: ModelDef = { ...customerDef, type: 'Sites' };
    const result = fromApiRecord({ SiteId: 1234 }, sitesDef);
    expect(result.id).toBe(1234);
  });

  it('CreatedTime / UpdatedTime → createdAt / updatedAt (Date)', () => {
    const result = fromApiRecord(
      {
        ResultId: 1,
        CreatedTime: '2026-05-09T12:00:00.000Z',
        UpdatedTime: '2026-05-09T13:00:00.000Z',
      },
      customerDef,
    );
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('ClassHash → logical name', () => {
    const result = fromApiRecord(
      {
        ResultId: 1,
        ClassHash: { ClassA: 'C-001', ClassB: 'foo' },
      },
      customerDef,
    );
    expect(result.code).toBe('C-001');
    expect(result.name).toBe('foo');
  });

  it('NumHash → number', () => {
    const result = fromApiRecord(
      { ResultId: 1, NumHash: { NumA: 30 } },
      customerDef,
    );
    expect(result.age).toBe(30);
  });

  it('CheckHash → boolean', () => {
    const result = fromApiRecord(
      { ResultId: 1, CheckHash: { CheckA: true } },
      customerDef,
    );
    expect(result.isVip).toBe(true);
  });

  it('DateHash → Date', () => {
    const result = fromApiRecord(
      { ResultId: 1, DateHash: { DateA: '2026-05-09T12:00:00.000Z' } },
      customerDef,
    );
    expect(result.birthdate).toBeInstanceOf(Date);
  });

  it('Status (直接カラム) → そのまま', () => {
    const result = fromApiRecord({ ResultId: 1, Status: 100 }, customerDef);
    expect(result.status).toBe(100);
  });

  it('Title (直接カラム) → そのまま', () => {
    const result = fromApiRecord({ ResultId: 1, Title: 'foo' }, customerDef);
    expect(result.title).toBe('foo');
  });

  it('未定義の slot は無視（result に含めない）', () => {
    const result = fromApiRecord(
      {
        ResultId: 1,
        ClassHash: { ClassA: 'C-001', ClassZ: '無関係' },
      },
      customerDef,
    );
    expect(result.code).toBe('C-001');
    expect(Object.keys(result)).not.toContain('ClassZ');
  });

  it('全部組み合わせ', () => {
    const result = fromApiRecord(
      {
        ResultId: 42,
        Title: 'タイトル',
        Status: 100,
        ClassHash: { ClassA: 'C-001', ClassB: 'foo' },
        NumHash: { NumA: 30 },
        CreatedTime: '2026-05-09T12:00:00.000Z',
        UpdatedTime: '2026-05-09T13:00:00.000Z',
      },
      customerDef,
    );
    expect(result).toMatchObject({
      id: 42,
      title: 'タイトル',
      status: 100,
      code: 'C-001',
      name: 'foo',
      age: 30,
    });
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
