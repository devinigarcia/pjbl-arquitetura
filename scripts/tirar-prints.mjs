#!/usr/bin/env node
// Tira os prints usados na Parte IV do PDF e salva em docs/prints/.
// Usa o Edge (ou Chrome) em modo headless, então funciona sem abrir janela.
//
//   node scripts/tirar-prints.mjs paginas
//       Swagger do BFF e dos microserviços, AsyncAPI, Swagger da Function, telas do front,
//       Docker Hub e GitHub Actions — tudo a partir das URLs do links.json.
//
//   node scripts/tirar-prints.mjs gateway
//       Faz três chamadas de verdade (sem chave, com chave, direto no BFF) e gera o print
//       gateway-chamadas.png com as respostas. Precisa da variável API_KEY (subscription key).
//
//   node scripts/tirar-prints.mjs terminal <arquivo.png> "<título>" <pasta> <comando...>
//       Roda um comando e transforma a saída num print com cara de terminal. Exemplo:
//       node scripts/tirar-prints.mjs terminal testes.png "npm test — pjbl-bff" ../pjbl-bff npm test
//
// O print do portal do API Management (gateway-portal.png) precisa de login na Azure,
// então é o único que tem que ser tirado na mão.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRINTS = join(ROOT, 'docs', 'prints');
mkdirSync(PRINTS, { recursive: true });

const links = existsSync(join(ROOT, 'links.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'links.json'), 'utf8').replace(/^\uFEFF/, ''))
  : {};
// --local: usa os endereços do ambiente local (só para conferir o layout do PDF antes do deploy;
// os prints da entrega têm que ser tirados nas URLs da nuvem)
if (process.argv.includes('--local')) {
  Object.assign(links, {
    URL_FRONTEND: 'http://localhost:4173',
    URL_BFF: 'http://localhost:3000',
    URL_MS_PRODUTOS: 'http://localhost:3001',
    URL_MS_PEDIDOS: 'http://localhost:3002',
    URL_FUNCTION: 'http://localhost:7071',
    GITHUB_USER: '',
    DOCKERHUB_USER: '',
  });
}
const link = (key) => String(links[key] ?? '').trim().replace(/\/+$/, '');

const browser = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].find((candidate) => candidate && existsSync(candidate));
if (!browser) throw new Error('Não encontrei Edge/Chrome. Defina BROWSER_PATH.');

function screenshot(url, file, { width = 1360, height = 900, wait = 9000 } = {}) {
  const output = join(PRINTS, file);
  const result = spawnSync(
    browser,
    [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${width},${height}`, `--virtual-time-budget=${wait}`, `--screenshot=${output}`, url,
    ],
    { stdio: 'ignore', timeout: 90000 },
  );
  const ok = result.status === 0 && existsSync(output);
  console.log(`${ok ? 'ok  ' : 'ERRO'} ${file}  <-  ${url}`);
  return ok;
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

function terminalPrint(file, title, text, { width = 1100 } = {}) {
  const lines = text.replace(/\r/g, '').split('\n');
  const height = Math.min(1500, 90 + lines.length * 17.5);
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0f1720">
<div style="font:13px/1.35 Consolas,'Courier New',monospace;color:#d8dee9;padding:0">
<div style="background:#1c2733;color:#9fb1c3;padding:8px 14px;font-family:'Segoe UI',Arial,sans-serif;font-size:12.5px">${escapeHtml(title)}</div>
<pre style="margin:0;padding:12px 16px;white-space:pre-wrap;font:inherit">${escapeHtml(text)
    .replace(/^(.*(?:✓|passed|201|200 ).*)$/gm, '<span style="color:#8fd694">$1</span>')
    .replace(/^(.*(?:×|failed|FAIL|401|AssertionError|ERRO).*)$/gm, '<span style="color:#ff8a8a">$1</span>')}</pre></div>`;
  const page = join(tmpdir(), `pjbl-print-${Date.now()}.html`);
  writeFileSync(page, html);
  return screenshot(pathToFileURL(page).href, file, { width, height: Math.round(height), wait: 500 });
}

const [command, ...rest] = process.argv.slice(2);

if (command === 'paginas') {
  const front = link('URL_FRONTEND');
  const github = link('GITHUB_USER');
  const dockerhub = link('DOCKERHUB_USER');
  const shots = [
    [link('URL_BFF') && `${link('URL_BFF')}/docs`, 'swagger-bff.png', { height: 1500 }],
    [link('URL_MS_PRODUTOS') && `${link('URL_MS_PRODUTOS')}/docs`, 'swagger-ms-produtos.png', { height: 1300 }],
    [link('URL_MS_PEDIDOS') && `${link('URL_MS_PEDIDOS')}/docs`, 'swagger-ms-pedidos.png', { height: 1400 }],
    [link('URL_MS_PEDIDOS') && `${link('URL_MS_PEDIDOS')}/events/docs`, 'asyncapi-eventos.png', { height: 1500, wait: 14000 }],
    [link('URL_FUNCTION') && `${link('URL_FUNCTION')}/api/docs`, 'swagger-function.png', { height: 1000 }],
    [front && `${front}/#/`, 'front-dashboard.png', { height: 1500, wait: 14000 }],
    [front && `${front}/#/produtos`, 'front-produtos.png', { height: 1100, wait: 14000 }],
    [front && `${front}/#/pedidos`, 'front-pedidos.png', { height: 1100, wait: 14000 }],
    [dockerhub && `https://hub.docker.com/u/${dockerhub}`, 'dockerhub.png', { height: 1000, wait: 14000 }],
    [github && `https://github.com/${github}/pjbl-bff/actions`, 'github-actions.png', { height: 1000, wait: 12000 }],
  ];
  for (const [url, file, options] of shots) {
    if (!url) console.log(`pulei ${file} (falta o link no links.json)`);
    else screenshot(url, file, options);
  }
} else if (command === 'gateway') {
  const gateway = link('URL_GATEWAY');
  const bff = link('URL_BFF');
  const key = process.env.API_KEY;
  if (!gateway || !bff || !key) throw new Error('Preciso de URL_GATEWAY e URL_BFF no links.json e da variável API_KEY.');

  const call = async (label, url, headers = {}) => {
    const response = await fetch(url, { headers });
    const body = await response.text();
    const shown = ['x-gateway', 'x-served-by', 'x-correlation-id', 'server-timing']
      .filter((name) => response.headers.get(name))
      .map((name) => `  ${name}: ${response.headers.get(name)}`);
    return [`$ ${label}`, `HTTP ${response.status} ${response.statusText}`, ...shown, `  ${body.slice(0, 230)}${body.length > 230 ? '…' : ''}`, ''].join('\n');
  };

  const text = [
    await call(`curl -i ${gateway}/aggregated-data                      # sem chave`, `${gateway}/aggregated-data`),
    await call(`curl -i -H "Ocp-Apim-Subscription-Key: ****" ${gateway}/aggregated-data`, `${gateway}/aggregated-data`, { 'Ocp-Apim-Subscription-Key': key }),
    await call(`curl -i ${bff}/aggregated-data                      # direto no BFF, pulando o gateway`, `${bff}/aggregated-data`),
  ].join('\n');
  terminalPrint('gateway-chamadas.png', 'API Gateway — roteamento, chave obrigatória e bloqueio de acesso direto ao BFF', text, { width: 1250 });
} else if (command === 'terminal') {
  const [file, title, cwd, ...cmd] = rest;
  if (!file || !title || !cwd || cmd.length === 0) throw new Error('uso: terminal <arquivo.png> "<título>" <pasta> <comando...>');
  const result = spawnSync(cmd.join(' '), { cwd: resolve(cwd), shell: true, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
  const output = stripAnsi(`${result.stdout ?? ''}${result.stderr ?? ''}`).trim();
  const lines = output.split('\n');
  // saída muito longa: mantém o começo e o fim, que é onde está o resumo
  const shown = lines.length > 70 ? [...lines.slice(0, 22), `   … (${lines.length - 62} linhas omitidas) …`, ...lines.slice(-40)] : lines;
  terminalPrint(file, title, `$ ${cmd.join(' ')}\n${shown.join('\n')}`);
} else {
  console.log('uso: node scripts/tirar-prints.mjs paginas | gateway | terminal <arquivo.png> "<título>" <pasta> <comando...>');
  process.exitCode = 1;
}
