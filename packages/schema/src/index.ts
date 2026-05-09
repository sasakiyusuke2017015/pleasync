// @pleasync/schema — Phase 1
//
// pleasync.schema.yaml をパースして AST に変換し、構造を検証する。
// 詳細仕様: docs/schema-spec.md

export { parseSchema, resolveServerConfig } from './parser.js';
export { validateSchema } from './validator.js';
export type {
  SchemaAst,
  ServerConfig,
  Choice,
  Model,
  Field,
  FieldType,
  ReferenceType,
  ValidationResult,
  ValidationError,
  ValidationErrorCode,
} from './ast.js';
