#!/usr/bin/env node
// Demonstra que os testes de arquitetura realmente pegam um erro.
// Planta uma violação no BFF (o domínio importando o Express), roda os testes de arquitetura,
// mostra a falha e DEVOLVE o arquivo ao estado original — mesmo se algo der errado no meio.
//
// Uso: node scripts/demo-violacao.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BFF = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'pjbl-bff');
const target = join(BFF, 'src', 'domain', 'orderDraft.ts');
const violation = "import express from 'express'; // violação plantada de propósito\n";
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

const original = readFileSync(target, 'utf8');
console.log('Plantando em src/domain/orderDraft.ts:');
console.log(`  ${violation.trim()}\n`);

try {
  writeFileSync(target, violation + original);
  const result = spawnSync('npx vitest run tests/architecture', { cwd: BFF, shell: true, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const output = stripAnsi(`${result.stdout ?? ''}${result.stderr ?? ''}`);

  // mostra só o que interessa: os testes que falharam, a mensagem e o resumo
  const lines = output.split('\n').filter((line) => /×|FAIL|AssertionError|importa|Expected|Received|^\s*[-+]\s|Test Files|Tests\s/.test(line));
  console.log(lines.slice(0, 40).join('\n'));
  console.log(`\ncódigo de saída: ${result.status} (${result.status === 0 ? 'os testes NÃO pegaram a violação!' : 'a esteira barraria esse commit'})`);
} finally {
  writeFileSync(target, original);
  console.log('\nArquivo restaurado ao estado original.');
}
