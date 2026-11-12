#!/usr/bin/env node
// Troca os placeholders {{...}} dos READMEs e documentos pelos valores reais.
//
// Os valores vêm de dois arquivos na raiz do pjbl-arquitetura:
//   links.json   -> URLs e usuários (gerado em parte pelo deploy-azure.ps1; veja links.example.json)
//   alunos.json  -> lista de alunos (veja alunos.example.json)
//
// Uso:
//   node scripts/preencher-links.mjs            aplica nos seis repositórios (pastas irmãs)
//   node scripts/preencher-links.mjs --check    só lista os placeholders que ainda faltam (não altera nada)
//
// Pode rodar de novo quando um link mudar (ex.: quando o vídeo for publicado): o script guarda o que
// aplicou em links.aplicados.json e troca o valor antigo pelo novo.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = join(ROOT, '..');
const REPOS = ['pjbl-microfrontend', 'pjbl-bff', 'pjbl-ms-produtos', 'pjbl-ms-pedidos', 'pjbl-function', 'pjbl-arquitetura'];
const KEYS = [
  'ALUNOS', 'GITHUB_USER', 'DOCKERHUB_USER', 'URL_FRONTEND', 'URL_GATEWAY', 'URL_BFF',
  'URL_MS_PRODUTOS', 'URL_MS_PEDIDOS', 'URL_FUNCTION', 'URL_VIDEO',
];
const TEXT_EXTENSIONS = new Set(['.md']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build', '.vite']);
// arquivos que explicam os placeholders e por isso devem continuar com eles
const IGNORED_FILES = new Set(['contratos.md']);

const checkOnly = process.argv.includes('--check');

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

function studentsMarkdown(students) {
  if (!Array.isArray(students) || students.length === 0) return '';
  return students
    .map((student) => {
      const name = typeof student === 'string' ? student : student.nome;
      const ra = typeof student === 'object' && student.ra ? ` — RA ${student.ra}` : '';
      return `- ${name}${ra}`;
    })
    .join('\n');
}

function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (IGNORED_DIRS.has(entry)) return [];
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return listFiles(full);
    return TEXT_EXTENSIONS.has(extname(entry)) && !IGNORED_FILES.has(entry) ? [full] : [];
  });
}

const links = readJson(join(ROOT, 'links.json'), {});
const students = readJson(join(ROOT, 'alunos.json'), []);
const appliedPath = join(ROOT, 'links.aplicados.json');
const applied = readJson(appliedPath, {});

const values = {};
for (const key of KEYS) {
  const value = key === 'ALUNOS' ? studentsMarkdown(students) : String(links[key] ?? '').trim().replace(/\/+$/, '');
  if (value) values[key] = value;
}

const files = REPOS.map((repo) => join(WORKSPACE, repo))
  .filter((path) => existsSync(path))
  .flatMap(listFiles);

let changedFiles = 0;
const missing = new Map();

for (const file of files) {
  const original = readFileSync(file, 'utf8');
  let content = original;

  for (const key of KEYS) {
    const value = values[key];
    if (!value) continue;
    content = content.split(`{{${key}}}`).join(value);

    // valor mudou desde a última execução: troca o antigo pelo novo
    const previous = applied[key];
    if (previous && previous !== value && previous.length >= 8) {
      content = content.split(previous).join(value);
    }
  }

  for (const match of content.matchAll(/\{\{([A-Z][A-Z0-9_]+)\}\}/g)) {
    const list = missing.get(match[1]) ?? [];
    list.push(relative(WORKSPACE, file));
    missing.set(match[1], list);
  }

  if (content !== original && !checkOnly) {
    writeFileSync(file, content);
    changedFiles += 1;
  }
}

if (!checkOnly) {
  writeFileSync(appliedPath, `${JSON.stringify({ ...applied, ...values }, null, 2)}\n`);
  console.log(`${changedFiles} arquivo(s) atualizado(s) de ${files.length} verificados.`);
}

if (missing.size === 0) {
  console.log('Nenhum placeholder pendente. Tudo preenchido.');
} else {
  console.log('\nPlaceholders ainda sem valor (preencha links.json / alunos.json e rode de novo):');
  for (const [key, where] of missing) {
    console.log(`  {{${key}}} em ${[...new Set(where)].length} arquivo(s)`);
    for (const path of [...new Set(where)].slice(0, 8)) console.log(`      ${path}`);
  }
  if (checkOnly) process.exitCode = 1;
}
