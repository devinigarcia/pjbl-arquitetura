#!/usr/bin/env node
// Roda os testes dos cinco projetos (pastas irmãs) e mostra um resumo de cada um.
// Uso: node scripts/resumo-testes.mjs            todos os testes
//      node scripts/resumo-testes.mjs --arch     só os testes de arquitetura
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPOS = ['pjbl-ms-produtos', 'pjbl-ms-pedidos', 'pjbl-function', 'pjbl-bff', 'pjbl-microfrontend'];
const onlyArch = process.argv.includes('--arch');
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

let total = 0;
let failed = false;

for (const repo of REPOS) {
  const cwd = join(WORKSPACE, repo);
  if (!existsSync(cwd)) {
    console.log(`${repo.padEnd(20)} (pasta não encontrada)`);
    continue;
  }
  const command = onlyArch ? 'npx vitest run tests/architecture' : 'npx vitest run';
  const result = spawnSync(command, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const output = stripAnsi(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  const files = /Test Files\s+(.*)/.exec(output)?.[1]?.trim() ?? '?';
  const tests = /Tests\s+(.*)/.exec(output)?.[1]?.trim() ?? '?';
  const passed = Number(/(\d+) passed/.exec(tests)?.[1] ?? 0);
  total += passed;
  if (result.status !== 0) failed = true;

  console.log(`${result.status === 0 ? '✓' : '×'} ${repo}`);
  console.log(`    arquivos: ${files}`);
  console.log(`    testes:   ${tests}`);
}

console.log(`\n${failed ? '× há testes falhando' : '✓ tudo passou'} — ${total} testes ${onlyArch ? "de arquitetura " : ""}passaram nos ${REPOS.length} projetos`);
process.exitCode = failed ? 1 : 0;
