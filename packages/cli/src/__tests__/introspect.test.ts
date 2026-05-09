import { describe, it, expect } from 'vitest';
import { siteToModel, sitesToSchema, parseChoicesText } from '../introspect.js';
import type { RawSite } from '../introspect.js';

describe('parseChoicesText', () => {
  it('2 列フォーマット (value,label) をパース', () => {
    const choices = parseChoicesText('100,新規\n200,処理中\n300,完了');
    expect(choices).toEqual([
      { value: 100, label: '新規' },
      { value: 200, label: '処理中' },
      { value: 300, label: '完了' },
    ]);
  });

  it('1 列フォーマット (label のみ) をパース', () => {
    const choices = parseChoicesText('A\nB\nC');
    expect(choices).toEqual([
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
      { value: 'C', label: 'C' },
    ]);
  });

  it('文字列 value も number として解釈できる', () => {
    const choices = parseChoicesText('100,新規');
    expect(choices[0].value).toBe(100);
    expect(typeof choices[0].value).toBe('number');
  });

  it('value が非数値なら string', () => {
    const choices = parseChoicesText('A,アクティブ\nI,非活性');
    expect(choices[0].value).toBe('A');
  });

  it('[[SiteId]] 参照は無視', () => {
    const choices = parseChoicesText('[[123]]\n100,新規');
    expect(choices).toEqual([{ value: 100, label: '新規' }]);
  });

  it('空行を無視', () => {
    const choices = parseChoicesText('100,新規\n\n  \n200,処理中');
    expect(choices).toHaveLength(2);
  });

  it('value 重複は最初のみ採用', () => {
    const choices = parseChoicesText('100,新規\n100,別ラベル');
    expect(choices).toEqual([{ value: 100, label: '新規' }]);
  });

  it('label 空はスキップ', () => {
    const choices = parseChoicesText('100,\n200,有効');
    expect(choices).toEqual([{ value: 200, label: '有効' }]);
  });
});

describe('siteToModel', () => {
  it('基本的な site → model', () => {
    const raw: RawSite = {
      SiteId: 35535,
      Title: 'Customer',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: {
        Columns: [
          { ColumnName: 'ClassA', LabelText: '顧客コード' },
          { ColumnName: 'ClassB', LabelText: '名前' },
        ],
      },
    };

    const { name, model } = siteToModel(raw);
    expect(name).toBe('customer');
    expect(model.type).toBe('Results');
    expect(model.parentId).toBe(35534);
    expect(model.siteId).toBe(35535);
    expect(model.title).toBe('Customer');
    expect(model.fields.classA).toMatchObject({
      slot: 'ClassA',
      label: '顧客コード',
      type: 'text',
    });
  });

  it('Status カラムは type=status + choices をパース', () => {
    const raw: RawSite = {
      SiteId: 1,
      Title: 'm',
      ReferenceType: 'Results',
      ParentId: 0,
      SiteSettings: {
        Columns: [
          {
            ColumnName: 'Status',
            LabelText: '状況',
            ChoicesText: '100,新規\n900,完了',
          },
        ],
      },
    };

    const { model } = siteToModel(raw);
    const status = model.fields.status;
    expect(status.type).toBe('status');
    if (status.type === 'status' && Array.isArray(status.choices)) {
      expect(status.choices).toEqual([
        { value: 100, label: '新規' },
        { value: 900, label: '完了' },
      ]);
    } else {
      throw new Error('expected status with choices array');
    }
  });

  it('ChoicesText 付きの ClassA は type=class', () => {
    const raw: RawSite = {
      SiteId: 1,
      Title: 'm',
      ReferenceType: 'Results',
      ParentId: 0,
      SiteSettings: {
        Columns: [
          {
            ColumnName: 'ClassA',
            LabelText: 'カテゴリ',
            ChoicesText: '1,A\n2,B',
          },
        ],
      },
    };

    const { model } = siteToModel(raw);
    expect(model.fields.classA.type).toBe('class');
  });

  it('ChoicesText 無しの ClassA は type=text', () => {
    const raw: RawSite = {
      SiteId: 1,
      Title: 'm',
      ReferenceType: 'Results',
      ParentId: 0,
      SiteSettings: {
        Columns: [{ ColumnName: 'ClassA', LabelText: 'コード' }],
      },
    };

    const { model } = siteToModel(raw);
    expect(model.fields.classA.type).toBe('text');
  });

  it('ColumnName プレフィックスから type を推定', () => {
    const raw: RawSite = {
      SiteId: 1,
      Title: 'm',
      ReferenceType: 'Issues',
      ParentId: 0,
      SiteSettings: {
        Columns: [
          { ColumnName: 'NumA', LabelText: '数' },
          { ColumnName: 'DateA', LabelText: '日付' },
          { ColumnName: 'CheckA', LabelText: 'フラグ' },
          { ColumnName: 'DescriptionA', LabelText: '説明' },
          { ColumnName: 'StartTime', LabelText: '開始' },
          { ColumnName: 'CompletionTime', LabelText: '完了' },
        ],
      },
    };

    const { model } = siteToModel(raw);
    expect(model.fields.numA.type).toBe('number');
    expect(model.fields.dateA.type).toBe('datetime');
    expect(model.fields.checkA.type).toBe('check');
    expect(model.fields.descriptionA.type).toBe('description');
    expect(model.fields.startTime.type).toBe('datetime');
    expect(model.fields.completionTime.type).toBe('datetime');
  });

  it('Title / Body は type=text', () => {
    const raw: RawSite = {
      SiteId: 1,
      Title: 'm',
      ReferenceType: 'Results',
      ParentId: 0,
      SiteSettings: {
        Columns: [
          { ColumnName: 'Title', LabelText: 'タイトル' },
          { ColumnName: 'Body', LabelText: '本文' },
        ],
      },
    };

    const { model } = siteToModel(raw);
    expect(model.fields.title.type).toBe('text');
    expect(model.fields.body.type).toBe('text');
  });

  it('未対応の ColumnName (Comments, Creator など) はスキップ', () => {
    const raw: RawSite = {
      SiteId: 1,
      Title: 'm',
      ReferenceType: 'Results',
      ParentId: 0,
      SiteSettings: {
        Columns: [
          { ColumnName: 'Comments', LabelText: 'コメント' },
          { ColumnName: 'Creator', LabelText: '作成者' },
          { ColumnName: 'Updator', LabelText: '更新者' },
          { ColumnName: 'Ver', LabelText: 'Ver' },
          { ColumnName: 'IssueId', LabelText: 'ID' },
          { ColumnName: 'ClassA', LabelText: 'コード' },
        ],
      },
    };

    const { model } = siteToModel(raw);
    expect(Object.keys(model.fields)).toEqual(['classA']);
  });

  it('日本語タイトルの場合は site<id> にフォールバック', () => {
    const raw: RawSite = {
      SiteId: 35535,
      Title: '顧客マスタ',
      ReferenceType: 'Results',
      ParentId: 0,
      SiteSettings: { Columns: [] },
    };

    const { name } = siteToModel(raw);
    expect(name).toBe('site35535');
  });

  it('SiteId 欠落 → throw', () => {
    expect(() =>
      siteToModel({ Title: 'x', ReferenceType: 'Results' }),
    ).toThrow(/SiteId/);
  });

  it('未対応 ReferenceType → throw', () => {
    expect(() =>
      siteToModel({ SiteId: 1, ReferenceType: 'Bogus' }),
    ).toThrow(/ReferenceType/);
  });

  it('LabelText が空なら ColumnName を label に使う', () => {
    const raw: RawSite = {
      SiteId: 1,
      Title: 'm',
      ReferenceType: 'Results',
      ParentId: 0,
      SiteSettings: {
        Columns: [{ ColumnName: 'ClassA', LabelText: '' }],
      },
    };

    const { model } = siteToModel(raw);
    expect(model.fields.classA.label).toBe('ClassA');
  });
});

describe('sitesToSchema', () => {
  it('複数 site を合成', () => {
    const sites: RawSite[] = [
      {
        SiteId: 1,
        Title: 'Customer',
        ReferenceType: 'Results',
        ParentId: 0,
        SiteSettings: {
          Columns: [{ ColumnName: 'ClassA', LabelText: 'A' }],
        },
      },
      {
        SiteId: 2,
        Title: 'Invoice',
        ReferenceType: 'Results',
        ParentId: 0,
        SiteSettings: {
          Columns: [{ ColumnName: 'ClassA', LabelText: 'B' }],
        },
      },
    ];

    const ast = sitesToSchema(sites);
    expect(ast.version).toBe('1');
    expect(Object.keys(ast.models)).toEqual(['customer', 'invoice']);
  });

  it('同名 model は数字 suffix で衝突回避', () => {
    const sites: RawSite[] = [
      {
        SiteId: 1,
        Title: 'Customer',
        ReferenceType: 'Results',
        ParentId: 0,
        SiteSettings: { Columns: [] },
      },
      {
        SiteId: 2,
        Title: 'Customer',
        ReferenceType: 'Results',
        ParentId: 0,
        SiteSettings: { Columns: [] },
      },
    ];

    const ast = sitesToSchema(sites);
    expect(Object.keys(ast.models)).toEqual(['customer', 'customer2']);
  });
});
