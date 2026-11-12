#!/usr/bin/env node
// Monta o documento da Entrega 3 (ARC42 + C4 + Canvas + prints) e imprime em PDF.
//
//   node scripts/gerar-pdf.mjs            gera docs/entrega/Entrega3-ConectaStore.pdf
//   node scripts/gerar-pdf.mjs --check    só lista o que ainda está pendente (links e prints)
//
// De onde vêm os dados:
//   docs/entrega/arc42.template.html   texto do documento
//   docs/diagramas/definicoes.mjs      diagramas (entram como SVG, direto no HTML)
//   docs/prints/*.png                  evidências (print que não existir vira um quadro "pendente")
//   links.json, alunos.json            URLs e nomes
//   docs/entrega/dados.json            números que mudam (quantidade de testes etc.)
//
// O PDF é impresso pelo Microsoft Edge em modo headless, que já vem no Windows.
// Em outro sistema, aponte a variável BROWSER_PATH para um Chrome/Edge/Chromium.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DIAGRAMAS } from '../docs/diagramas/definicoes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTREGA = join(ROOT, 'docs', 'entrega');
const PRINTS = join(ROOT, 'docs', 'prints');
const checkOnly = process.argv.includes('--check');

const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) : fallback;
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const links = readJson(join(ROOT, 'links.json'), {});
const students = readJson(join(ROOT, 'alunos.json'), []);
const data = readJson(join(ENTREGA, 'dados.json'), {});
const pending = [];

const value = (key) => String(links[key] ?? '').trim().replace(/\/+$/, '');
const pendingTag = (what) => {
  pending.push(what);
  return `<span class="pendente">pendente: ${esc(what)}</span>`;
};

let html = readFileSync(join(ENTREGA, 'arc42.template.html'), 'utf8');

// [[link:CHAVE|/caminho]]  -> link clicável, ou aviso de pendente se a URL ainda não existe
html = html.replace(/\[\[link:([A-Z_]+)(?:\|([^\]]*))?\]\]/g, (_, key, suffix = '') => {
  const base = value(key);
  if (!base) return pendingTag(key);
  const url = base + suffix;
  return `<a href="${esc(url)}">${esc(url)}</a>`;
});

// [[github:repositorio]] e [[dockerhub:imagem]]
html = html.replace(/\[\[github:([\w-]+)\]\]/g, (_, repo) => {
  const user = value('GITHUB_USER');
  if (!user) return pendingTag('GITHUB_USER');
  const url = `https://github.com/${user}/${repo}`;
  return `<a href="${url}">${url}</a>`;
});
html = html.replace(/\[\[dockerhub:([\w-]+)\]\]/g, (_, image) => {
  const user = value('DOCKERHUB_USER');
  if (!user) return pendingTag('DOCKERHUB_USER');
  const url = `https://hub.docker.com/r/${user}/${image}`;
  return `<a href="${url}">${url}</a> <span class="mono">(${user}/${image}:v1)</span>`;
});

// {{dado:caminho.do.valor}} -> docs/entrega/dados.json
html = html.replace(/\{\{dado:([\w.]+)\}\}/g, (_, path) => {
  const found = path.split('.').reduce((node, part) => (node == null ? node : node[part]), data);
  return found === undefined || found === null || found === '' ? pendingTag(`dado ${path}`) : esc(found);
});

// alunos
const studentName = (student) => (typeof student === 'string' ? student : student.nome);
const studentRa = (student) => (typeof student === 'object' && student.ra ? ` — RA ${student.ra}` : '');
html = html.replaceAll(
  '{{ALUNOS_HTML}}',
  students.length ? students.map((student) => `<li>${esc(studentName(student))}${esc(studentRa(student))}</li>`).join('') : `<li>${pendingTag('alunos.json')}</li>`,
);
html = html.replaceAll('{{ALUNOS_INLINE}}', students.length ? esc(students.map(studentName).join(', ')) : pendingTag('alunos.json'));
html = html.replaceAll('{{DATA}}', new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }));

// <!--DIAGRAMA:nome-->
html = html.replace(/<!--DIAGRAMA:([\w-]+)-->/g, (_, name) => {
  if (!DIAGRAMAS[name]) throw new Error(`Diagrama desconhecido no template: ${name}`);
  return DIAGRAMAS[name]();
});

// <!--PRINT:arquivo.png|Legenda-->
html = html.replace(/<!--PRINT:([^|]+)\|([^>]*?)-->/g, (_, file, caption) => {
  const path = join(PRINTS, file.trim());
  if (!existsSync(path)) {
    pending.push(`print ${file.trim()}`);
    return `<figure class="print faltando"><div>Print pendente: <b>${esc(file.trim())}</b></div><figcaption>${esc(caption)}</figcaption></figure>`;
  }
  const base64 = readFileSync(path).toString('base64');
  return `<figure class="print"><img alt="${esc(caption)}" src="data:image/png;base64,${base64}"><figcaption>${esc(caption)}</figcaption></figure>`;
});

const leftovers = [...html.matchAll(/\{\{[A-Za-z_:.]+\}\}|\[\[[a-z]+:[^\]]*\]\]/g)].map((match) => match[0]);
if (leftovers.length) throw new Error(`Marcadores não resolvidos no template: ${[...new Set(leftovers)].join(', ')}`);

if (pending.length) {
  console.log('Pendências (o PDF sai mesmo assim, com um aviso em cada uma):');
  for (const item of [...new Set(pending)]) console.log(`  - ${item}`);
} else {
  console.log('Nenhuma pendência: todos os links, dados e prints estão no documento.');
}
if (checkOnly) process.exit(pending.length ? 1 : 0);

const tmpDir = join(ENTREGA, '.tmp');
mkdirSync(tmpDir, { recursive: true });
const htmlPath = join(tmpDir, 'arc42.html');
writeFileSync(htmlPath, html);

const browser = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && existsSync(candidate));
if (!browser) throw new Error('Não encontrei Edge/Chrome. Defina BROWSER_PATH com o caminho do navegador.');

const pdfPath = join(ENTREGA, 'Entrega3-ConectaStore.pdf');
const result = spawnSync(
  browser,
  ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href],
  { stdio: 'ignore' },
);
if (result.status !== 0 || !existsSync(pdfPath)) throw new Error('O navegador não conseguiu gerar o PDF.');
console.log(`\nPDF gerado: ${pdfPath}`);
