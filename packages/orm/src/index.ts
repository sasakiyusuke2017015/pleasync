// @pleasync/orm — Phase 2 scaffolding
//
// このパッケージは「生成された型付きクライアントが import するランタイム」。
// codegen 出力 (例: ./pleasync-generated/index.ts) が
//
//   import { Engine, ModelCollection } from '@pleasync/orm'
//
// のように利用する想定。
//
// Phase 2 で実装予定のシンボル:
//   class Engine                  // @pleasync/client の薄いラッパー
//   class ModelCollection<T>      // findMany/findUnique/create/update/delete
//   types: WhereInput, OrderBy, etc.

export const PACKAGE_NAME = '@pleasync/orm';
export const VERSION = '0.0.0';
