#!/usr/bin/env node
// Popula o Conecta Store com dados de demonstração, sempre passando pelo gateway/BFF
// (do mesmo jeito que o front faz). Pode rodar mais de uma vez: produtos repetidos são
// reaproveitados e os pedidos só são criados se ainda houver poucos.
//
// Uso (PowerShell):
//   $env:API_URL = "https://apim-pjbl-xxxxxx.azure-api.net/conecta"
//   $env:API_KEY = "<subscription key do gateway>"
//   node scripts/seed.mjs
//
// Local, direto no BFF:   node scripts/seed.mjs            (usa http://localhost:3000)
// Opções:                 --force  cria os pedidos mesmo que já existam vários

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const API_KEY = process.env.API_KEY ?? '';
const GATEWAY_SECRET = process.env.GATEWAY_SECRET ?? '';
const force = process.argv.includes('--force');

const PRODUCTS = [
  { sku: 'CAFE-500G', name: 'Café torrado e moído 500g', category: 'Mercearia', price: 24.9, stock: 40, description: 'Torra média, embalagem a vácuo.' },
  { sku: 'ACUCAR-1KG', name: 'Açúcar refinado 1kg', category: 'Mercearia', price: 5.49, stock: 60, description: 'Pacote de 1 quilo.' },
  { sku: 'ARROZ-5KG', name: 'Arroz branco tipo 1 5kg', category: 'Mercearia', price: 27.9, stock: 25, description: 'Grãos longos e finos.' },
  { sku: 'SUCO-UVA-1L', name: 'Suco de uva integral 1L', category: 'Bebidas', price: 14.5, stock: 18, description: 'Sem adição de açúcar.' },
  { sku: 'AGUA-GAS-500', name: 'Água com gás 500ml', category: 'Bebidas', price: 3.2, stock: 4, description: 'Garrafa individual. Estoque baixo de propósito para o alerta aparecer.' },
  { sku: 'DETERG-500', name: 'Detergente neutro 500ml', category: 'Limpeza', price: 2.99, stock: 80, description: 'Rende bastante.' },
  { sku: 'SABAO-PO-1KG', name: 'Sabão em pó 1kg', category: 'Limpeza', price: 12.9, stock: 0, description: 'Cadastrado sem estoque para testar o bloqueio de pedido.' },
  { sku: 'SABONETE-90G', name: 'Sabonete em barra 90g', category: 'Higiene', price: 2.49, stock: 35, description: 'Fragrância erva-doce.' },
];

// cada pedido lista [sku, quantidade] e o caminho de status que ele percorre depois de criado
const ORDERS = [
  { customerName: 'Ana Souza', customerEmail: 'ana.souza@exemplo.com', items: [['CAFE-500G', 2], ['ACUCAR-1KG', 1]], path: [] },
  { customerName: 'Bruno Lima', customerEmail: 'bruno.lima@exemplo.com', items: [['ARROZ-5KG', 1], ['DETERG-500', 3]], path: ['PAGO'] },
  { customerName: 'Carla Mendes', customerEmail: 'carla.mendes@exemplo.com', items: [['SUCO-UVA-1L', 4]], path: ['PAGO', 'ENVIADO'], notes: 'Entregar no período da tarde.' },
  { customerName: 'Diego Ferraz', customerEmail: 'diego.ferraz@exemplo.com', items: [['CAFE-500G', 3], ['SABONETE-90G', 6]], path: ['PAGO', 'ENVIADO', 'ENTREGUE'] },
  { customerName: 'Eduarda Rocha', customerEmail: 'eduarda.rocha@exemplo.com', items: [['ACUCAR-1KG', 5]], path: ['CANCELADO'], notes: 'Cliente desistiu da compra.' },
];

async function api(method, path, body) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (API_KEY) headers['Ocp-Apim-Subscription-Key'] = API_KEY;
  if (GATEWAY_SECRET) headers['x-gateway-secret'] = GATEWAY_SECRET;

  // o banco gratuito e os containers podem estar "dormindo": insiste um pouco em 502/503/504
  for (let attempt = 1; ; attempt += 1) {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      if (attempt >= 6) throw new Error(`Não consegui falar com ${API_URL}: ${error.message}`);
      await sleep(5000);
      continue;
    }
    if ([502, 503, 504].includes(response.status) && attempt < 6) {
      console.log(`   serviço acordando (HTTP ${response.status}), tentando de novo em 10s...`);
      await sleep(10000);
      continue;
    }
    const text = await response.text();
    const data = text ? safeJson(text) : null;
    return { status: response.status, data };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
const describeError = (result) => `HTTP ${result.status} ${result.data?.error?.code ?? ''} ${result.data?.error?.message ?? ''}`.trim();

async function ensureProduct(product) {
  const created = await api('POST', '/products', product);
  if (created.status === 201) {
    console.log(`   + ${product.sku} criado`);
    return created.data;
  }
  if (created.status === 409) {
    const found = await api('GET', `/products?search=${encodeURIComponent(product.sku)}&pageSize=100`);
    const existing = found.data?.items?.find((item) => item.sku === product.sku);
    if (existing) {
      console.log(`   = ${product.sku} já existia`);
      return existing;
    }
  }
  throw new Error(`Falha ao criar ${product.sku}: ${describeError(created)}`);
}

async function main() {
  console.log(`Alvo: ${API_URL}${API_KEY ? ' (com subscription key)' : ''}\n`);

  console.log('Produtos');
  const bySku = new Map();
  for (const product of PRODUCTS) bySku.set(product.sku, await ensureProduct(product));

  console.log('\nPedidos');
  const existing = await api('GET', '/orders?pageSize=1');
  if (existing.status !== 200) throw new Error(`Não consegui listar pedidos: ${describeError(existing)}`);

  if (existing.data.total >= ORDERS.length && !force) {
    console.log(`   já existem ${existing.data.total} pedidos — nada a criar (use --force para criar mesmo assim)`);
  } else {
    for (const order of ORDERS) {
      const payload = {
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        ...(order.notes ? { notes: order.notes } : {}),
        items: order.items.map(([sku, quantity]) => ({ productId: bySku.get(sku).id, quantity })),
      };
      const created = await api('POST', '/orders', payload);
      if (created.status !== 201) {
        console.log(`   ! ${order.customerName}: ${describeError(created)}`);
        continue;
      }
      const id = created.data.order.id;
      for (const status of order.path) {
        const changed = await api('PATCH', `/orders/${id}/status`, { status });
        if (changed.status !== 200) console.log(`   ! ${order.customerName} → ${status}: ${describeError(changed)}`);
      }
      console.log(`   + ${order.customerName}: ${['PENDENTE', ...order.path].join(' → ')}`);
    }
  }

  console.log('\nAguardando os eventos passarem pela fila e pela Function (10s)...');
  await sleep(10000);

  const aggregated = await api('GET', '/aggregated-data');
  if (aggregated.status !== 200) throw new Error(`/aggregated-data respondeu ${describeError(aggregated)}`);
  const { sources, products, orders, recentEvents, indicators, partial } = aggregated.data;

  console.log('\nResumo do /aggregated-data');
  console.log(`   produtos: ${products?.total ?? '—'} | pedidos: ${orders?.total ?? '—'} | eventos recentes: ${recentEvents.length} | parcial: ${partial}`);
  for (const [name, source] of Object.entries(sources)) {
    console.log(`   ${name.padEnd(14)} ${source.status.padEnd(8)} ${source.durationMs} ms ${source.error ?? ''}`);
  }
  const published = recentEvents.filter((event) => event.status === 'PUBLICADO').length;
  console.log(`   eventos publicados: ${published} de ${recentEvents.length}`);
  if (indicators?.orders) {
    console.log(`   faturamento: R$ ${indicators.orders.revenue} | ticket médio: R$ ${indicators.orders.averageTicket}`);
  }
  for (const alert of indicators?.alerts ?? []) console.log(`   alerta: ${alert}`);
}

main().catch((error) => {
  console.error(`\nErro: ${error.message}`);
  process.exitCode = 1;
});
