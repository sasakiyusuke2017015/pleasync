import { describe, it, expect } from 'vitest';
import { formatPlan, planDiff } from '../diff.js';
import type { SchemaAst } from '@pleasync/schema';
import type { RawSite } from '../introspect.js';

function makeSchema(model: SchemaAst['models'][string]): SchemaAst {
  return { version: '1', models: { customer: model } };
}

const baseModel = {
  type: 'Results' as const,
  parentId: 35534,
  siteId: 35535,
  title: '顧客マスタ',
  fields: {
    code: { slot: 'ClassA', label: '顧客コード', type: 'text' as const },
    name: { slot: 'ClassB', label: '名前', type: 'text' as const },
  },
};

describe('planDiff', () => {
  it('site が無い → create', () => {
    const ast = makeSchema(baseModel);
    const plan = planDiff({ ast, existingSites: {} });
    expect(plan.models).toHaveLength(1);
    expect(plan.models[0].kind).toBe('create');
    if (plan.models[0].kind === 'create') {
      expect(plan.models[0].modelName).toBe('customer');
    }
  });

  it('完全一致 → unchanged', () => {
    const existing: RawSite = {
      SiteId: 35535,
      Title: '顧客マスタ',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: {
        Columns: [
          { ColumnName: 'ClassA', LabelText: '顧客コード' },
          { ColumnName: 'ClassB', LabelText: '名前' },
        ],
      },
    };

    const plan = planDiff({
      ast: makeSchema(baseModel),
      existingSites: { customer: existing },
    });

    expect(plan.models[0].kind).toBe('unchanged');
  });

  it('title 変更 → update with title change', () => {
    const existing: RawSite = {
      SiteId: 35535,
      Title: '古いタイトル',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: { Columns: [
        { ColumnName: 'ClassA', LabelText: '顧客コード' },
        { ColumnName: 'ClassB', LabelText: '名前' },
      ] },
    };

    const plan = planDiff({
      ast: makeSchema(baseModel),
      existingSites: { customer: existing },
    });

    expect(plan.models[0].kind).toBe('update');
    if (plan.models[0].kind === 'update') {
      expect(plan.models[0].changes).toContainEqual({
        kind: 'title',
        from: '古いタイトル',
        to: '顧客マスタ',
      });
    }
  });

  it('schema にあるが site にないカラム → add-column', () => {
    const existing: RawSite = {
      SiteId: 35535,
      Title: '顧客マスタ',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: {
        Columns: [{ ColumnName: 'ClassA', LabelText: '顧客コード' }],
      },
    };

    const plan = planDiff({
      ast: makeSchema(baseModel),
      existingSites: { customer: existing },
    });

    expect(plan.models[0].kind).toBe('update');
    if (plan.models[0].kind === 'update') {
      const adds = plan.models[0].changes.filter(
        (c) => c.kind === 'add-column',
      );
      expect(adds).toHaveLength(1);
      if (adds[0].kind === 'add-column') {
        expect(adds[0].slot).toBe('ClassB');
      }
    }
  });

  it('label が違う → update-column-label', () => {
    const existing: RawSite = {
      SiteId: 35535,
      Title: '顧客マスタ',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: {
        Columns: [
          { ColumnName: 'ClassA', LabelText: '違うラベル' },
          { ColumnName: 'ClassB', LabelText: '名前' },
        ],
      },
    };

    const plan = planDiff({
      ast: makeSchema(baseModel),
      existingSites: { customer: existing },
    });

    expect(plan.models[0].kind).toBe('update');
    if (plan.models[0].kind === 'update') {
      expect(plan.models[0].changes).toContainEqual({
        kind: 'update-column-label',
        slot: 'ClassA',
        from: '違うラベル',
        to: '顧客コード',
      });
    }
  });

  it('choices の差分 → update-column-choices', () => {
    const ast = makeSchema({
      type: 'Results',
      parentId: 1,
      siteId: 100,
      title: 'M',
      fields: {
        status: {
          slot: 'Status',
          label: '状況',
          type: 'status',
          choices: [
            { value: 100, label: '新規' },
            { value: 900, label: '完了' },
          ],
        },
      },
    });

    const existing: RawSite = {
      SiteId: 100,
      Title: 'M',
      ReferenceType: 'Results',
      ParentId: 1,
      SiteSettings: {
        Columns: [
          {
            ColumnName: 'Status',
            LabelText: '状況',
            ChoicesText: '100,新規\n200,処理中\n900,完了',
          },
        ],
      },
    };

    const plan = planDiff({ ast, existingSites: { customer: existing } });
    expect(plan.models[0].kind).toBe('update');
    if (plan.models[0].kind === 'update') {
      const choiceChanges = plan.models[0].changes.filter(
        (c) => c.kind === 'update-column-choices',
      );
      expect(choiceChanges).toHaveLength(1);
    }
  });

  it('site にあるが schema にないカラム → orphan-column (情報のみ)', () => {
    const existing: RawSite = {
      SiteId: 35535,
      Title: '顧客マスタ',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: {
        Columns: [
          { ColumnName: 'ClassA', LabelText: '顧客コード' },
          { ColumnName: 'ClassB', LabelText: '名前' },
          { ColumnName: 'ClassC', LabelText: '昔の項目' },
        ],
      },
    };

    const plan = planDiff({
      ast: makeSchema(baseModel),
      existingSites: { customer: existing },
    });

    expect(plan.models[0].kind).toBe('update');
    if (plan.models[0].kind === 'update') {
      const orphans = plan.models[0].changes.filter(
        (c) => c.kind === 'orphan-column',
      );
      expect(orphans).toHaveLength(1);
      if (orphans[0].kind === 'orphan-column') {
        expect(orphans[0].slot).toBe('ClassC');
      }
    }
  });

  it('システムカラム (CreatedTime 等) は orphan 扱いしない', () => {
    const existing: RawSite = {
      SiteId: 35535,
      Title: '顧客マスタ',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: {
        Columns: [
          { ColumnName: 'ClassA', LabelText: '顧客コード' },
          { ColumnName: 'ClassB', LabelText: '名前' },
          { ColumnName: 'CreatedTime', LabelText: '作成日時' },
          { ColumnName: 'Comments', LabelText: 'コメント' },
        ],
      },
    };

    const plan = planDiff({
      ast: makeSchema(baseModel),
      existingSites: { customer: existing },
    });

    if (plan.models[0].kind === 'update') {
      const orphans = plan.models[0].changes.filter(
        (c) => c.kind === 'orphan-column',
      );
      expect(orphans).toHaveLength(0);
    } else {
      expect(plan.models[0].kind).toBe('unchanged');
    }
  });

  it('複数 model を独立に diff', () => {
    const ast: SchemaAst = {
      version: '1',
      models: {
        customer: baseModel,
        invoice: {
          ...baseModel,
          siteId: 35540,
          title: '請求書',
        },
      },
    };

    // customer は完全一致、invoice は site なし
    const existing: RawSite = {
      SiteId: 35535,
      Title: '顧客マスタ',
      ReferenceType: 'Results',
      ParentId: 35534,
      SiteSettings: {
        Columns: [
          { ColumnName: 'ClassA', LabelText: '顧客コード' },
          { ColumnName: 'ClassB', LabelText: '名前' },
        ],
      },
    };

    const plan = planDiff({
      ast,
      existingSites: { customer: existing },
    });

    expect(plan.models).toHaveLength(2);
    expect(plan.models.find((m) => m.modelName === 'customer')!.kind).toBe(
      'unchanged',
    );
    expect(plan.models.find((m) => m.modelName === 'invoice')!.kind).toBe(
      'create',
    );
  });
});

describe('formatPlan', () => {
  it('create / update / unchanged を含む summary を出す', () => {
    const text = formatPlan({
      models: [
        {
          kind: 'create',
          modelName: 'customer',
          model: baseModel,
        },
        {
          kind: 'update',
          modelName: 'invoice',
          siteId: 200,
          changes: [{ kind: 'title', from: 'Old', to: 'New' }],
        },
        { kind: 'unchanged', modelName: 'order', siteId: 300 },
      ],
    });

    expect(text).toMatch(/\+ customer/);
    expect(text).toMatch(/~ invoice .*siteId=200/);
    expect(text).toMatch(/= order .*siteId=300/);
    expect(text).toMatch(/Plan:.*1 to create.*1 to update.*1 unchanged/);
  });

  it('changes が複数あるとき個別に列挙', () => {
    const text = formatPlan({
      models: [
        {
          kind: 'update',
          modelName: 'm',
          siteId: 1,
          changes: [
            { kind: 'title', from: 'A', to: 'B' },
            {
              kind: 'add-column',
              slot: 'ClassC',
              label: '新項目',
              field: { slot: 'ClassC', label: '新項目', type: 'text' },
            },
          ],
        },
      ],
    });

    expect(text).toMatch(/title:.*"A".*"B"/);
    expect(text).toMatch(/\+ column ClassC/);
  });

  it('全部 unchanged のとき plan サマリも 0 to create / 0 to update', () => {
    const text = formatPlan({
      models: [
        { kind: 'unchanged', modelName: 'a', siteId: 1 },
        { kind: 'unchanged', modelName: 'b', siteId: 2 },
      ],
    });
    expect(text).toMatch(/0 to create.*0 to update.*2 unchanged/);
  });
});
