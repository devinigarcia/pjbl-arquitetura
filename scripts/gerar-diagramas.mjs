#!/usr/bin/env node
// Gera os SVGs dos diagramas (C4, implantação e sequência) em docs/c4/.
// Uso: node scripts/gerar-diagramas.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIAGRAMAS } from '../docs/diagramas/definicoes.mjs';

const output = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'c4');
mkdirSync(output, { recursive: true });

for (const [name, build] of Object.entries(DIAGRAMAS)) {
  writeFileSync(join(output, `${name}.svg`), build());
  console.log(`docs/c4/${name}.svg`);
}
