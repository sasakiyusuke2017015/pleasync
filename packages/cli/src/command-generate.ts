import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parseSchema, validateSchema } from '@pleasync/schema';
import { generateClient } from './generate.js';

export interface GenerateCommandOptions {
  /** schema YAML のパス（デフォルト: ./pleasync.schema.yaml） */
  schema?: string;
  /** 出力先ディレクトリ（デフォルト: ./pleasync-generated） */
  out?: string;
  /** 標準出力に書き込む（ファイルを書かない） */
  stdout?: boolean;
  /** カレントディレクトリ（テスト時に上書き可能） */
  cwd?: string;
}

/**
 * `pleasync generate` のメイン処理。CLI 引数のパースは args.parse 側で済んでいる前提。
 */
export async function runGenerate(options: GenerateCommandOptions): Promise<{
  outputPath: string | null;
  bytesWritten: number;
}> {
  const cwd = options.cwd ?? process.cwd();
  const schemaPath = resolveRelative(options.schema ?? 'pleasync.schema.yaml', cwd);
  const yaml = await readFile(schemaPath, 'utf-8');

  const ast = parseSchema(yaml);
  const result = validateSchema(ast);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  [${e.code}] ${e.path}: ${e.message}`);
    throw new Error(`schema validation failed:\n${lines.join('\n')}`);
  }

  const code = generateClient(result.ast, { schemaPath });

  if (options.stdout) {
    process.stdout.write(code);
    return { outputPath: null, bytesWritten: code.length };
  }

  const outDir = resolveRelative(options.out ?? 'pleasync-generated', cwd);
  const outFile = resolve(outDir, 'index.ts');
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, code, 'utf-8');

  return { outputPath: outFile, bytesWritten: code.length };
}

/**
 * argv から GenerateCommandOptions を構築して runGenerate を呼ぶ。
 * 主に CLI bin から使う。
 */
export async function runGenerateCommand(argv: readonly string[]): Promise<void> {
  const options = parseGenerateArgs(argv);
  if (options.help) {
    process.stdout.write(`pleasync generate

Usage:
  pleasync generate [options]

Options:
  --schema <path>   Schema YAML file (default: ./pleasync.schema.yaml)
  --out <dir>       Output directory (default: ./pleasync-generated)
  --stdout          Write to stdout instead of a file
  -h, --help        Show this help

Output: <out>/index.ts
`);
    return;
  }

  const result = await runGenerate(options);
  if (result.outputPath) {
    process.stdout.write(
      `[pleasync] generated ${result.outputPath} (${result.bytesWritten} bytes)\n`,
    );
  }
}

function parseGenerateArgs(
  argv: readonly string[],
): GenerateCommandOptions & { help?: boolean } {
  const opts: GenerateCommandOptions & { help?: boolean } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--schema':
        opts.schema = argv[++i];
        break;
      case '--out':
        opts.out = argv[++i];
        break;
      case '--stdout':
        opts.stdout = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        throw new Error(`unknown option: ${a}`);
    }
  }
  return opts;
}

function resolveRelative(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}
