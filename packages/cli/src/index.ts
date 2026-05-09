// pleasync CLI — Phase 2
//
// 実装済みコマンド:
//   pleasync generate              schema → typed client コード生成
//
// Phase 3+ で追加予定:
//   pleasync plan / apply / introspect

import { runGenerateCommand } from './command-generate.js';
import { runIntrospectCommand } from './command-introspect.js';

export async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'generate':
      await runGenerateCommand(rest);
      return;
    case 'introspect':
      await runIntrospectCommand(rest);
      return;
    case 'plan':
    case 'apply':
      process.stderr.write(
        `[pleasync] '${command}' is planned for a future phase (not yet implemented).\n`,
      );
      process.exit(2);
      return;
    default:
      process.stderr.write(`[pleasync] unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  process.stdout.write(`pleasync CLI

Usage:
  pleasync <command> [options]

Commands:
  generate            Generate typed client from pleasync.schema.yaml
  introspect <id>...  Reverse-engineer schema from existing Pleasanter site(s)
  plan                (planned) Show diff between Pleasanter and schema
  apply               (planned) Apply schema to Pleasanter (creates/updates sites)

Run \`pleasync <command> --help\` for command-specific options.
`);
}
