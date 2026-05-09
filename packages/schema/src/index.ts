// @pleasync/schema — Phase 1 scaffolding
//
// このパッケージは pleasync.schema.yaml をパースして AST にする責務を持つ。
// 公開予定の API:
//
//   parseSchema(yaml: string): SchemaAst
//   validateSchema(ast: SchemaAst): ValidationResult
//
// 詳細仕様は docs/schema-spec.md（未作成）で議論する。

export const PACKAGE_NAME = '@pleasync/schema';
export const VERSION = '0.0.0';
