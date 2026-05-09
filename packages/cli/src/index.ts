// pleasync CLI — Phase 2 scaffolding
//
// 実装予定のコマンド:
//   pleasync generate              schema → typed client コード生成
//   pleasync plan                  Pleasanter 現状と schema の差分を表示
//   pleasync apply                 schema を Pleasanter に適用（site 作成・更新）
//   pleasync introspect <siteId>   Pleasanter から schema を逆引き

export async function main(argv: readonly string[]): Promise<void> {
  const [command] = argv;

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'generate':
    case 'plan':
    case 'apply':
    case 'introspect':
      console.error(
        `[pleasync] '${command}' コマンドは Phase 2 で実装予定です（現状未実装）。`,
      );
      process.exit(2);
      break;
    default:
      console.error(`[pleasync] unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`pleasync CLI

Usage:
  pleasync <command> [options]

Commands (planned):
  generate          Generate typed client from pleasync.schema.yaml
  plan              Show diff between Pleasanter and schema
  apply             Apply schema to Pleasanter (creates/updates sites)
  introspect <id>   Reverse-engineer schema from existing Pleasanter site

Status: 🚧 Phase 2 — all commands are stubs.
`);
}
