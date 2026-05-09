import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runGenerate } from '../command-generate.js';

const SAMPLE_SCHEMA = `
version: '1'
models:
  customer:
    type: Results
    parentId: 35534
    siteId: 35535
    title: 顧客
    fields:
      code: { slot: ClassA, label: コード, type: text, required: true }
      name: { slot: ClassB, label: 名前, type: text }
`;

describe('runGenerate', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'pleasync-cli-test-'));
  });

  it('schema を読み込み、デフォルトの出力先 (pleasync-generated/index.ts) に書き出す', async () => {
    await writeFile(join(workDir, 'pleasync.schema.yaml'), SAMPLE_SCHEMA);

    const result = await runGenerate({ cwd: workDir });

    expect(result.outputPath).toBe(resolve(workDir, 'pleasync-generated/index.ts'));
    expect(result.bytesWritten).toBeGreaterThan(0);

    const content = await readFile(result.outputPath!, 'utf-8');
    expect(content).toContain('export interface CustomerRecord');
    expect(content).toContain('class CustomerCollection');
  });

  it('--schema で別ファイルを指定できる', async () => {
    await writeFile(join(workDir, 'custom.yaml'), SAMPLE_SCHEMA);

    const result = await runGenerate({
      cwd: workDir,
      schema: 'custom.yaml',
    });

    expect(result.outputPath).toContain('pleasync-generated');
    const content = await readFile(result.outputPath!, 'utf-8');
    expect(content).toContain('CustomerRecord');
  });

  it('--out で出力先ディレクトリを指定できる', async () => {
    await writeFile(join(workDir, 'pleasync.schema.yaml'), SAMPLE_SCHEMA);

    const result = await runGenerate({
      cwd: workDir,
      out: 'src/generated',
    });

    expect(result.outputPath).toBe(resolve(workDir, 'src/generated/index.ts'));
    const content = await readFile(result.outputPath!, 'utf-8');
    expect(content).toContain('CustomerRecord');
  });

  it('既存ディレクトリでも出力先が created される', async () => {
    await writeFile(join(workDir, 'pleasync.schema.yaml'), SAMPLE_SCHEMA);
    await mkdir(join(workDir, 'pleasync-generated'), { recursive: true });

    const result = await runGenerate({ cwd: workDir });
    expect(result.outputPath).toBeTruthy();
  });

  it('schema が見つからない → throw', async () => {
    await expect(runGenerate({ cwd: workDir })).rejects.toThrow();
  });

  it('schema が壊れている → schema validation failed メッセージで throw', async () => {
    await writeFile(
      join(workDir, 'pleasync.schema.yaml'),
      `
version: '1'
models:
  Customer:
    type: Results
    parentId: 1
    title: A
    fields:
      a: { slot: ClassA, label: a, type: number }
`,
    );

    await expect(runGenerate({ cwd: workDir })).rejects.toThrow(
      /schema validation failed/,
    );
  });
});
