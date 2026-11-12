#!/usr/bin/env node
// Teste de fumaça do fluxo completo, sempre pelo gateway/BFF (como o front faz):
//
//   produto criado → pedido criado → evento no outbox → fila → Function → estoque baixa
//   → pedido cancelado → evento → estoque volta → /aggregated-data mostra tudo
//
// Serve tanto para o ambiente local quanto para a nuvem:
//   node scripts/teste-fluxo.mjs                                  (http://localhost:3000)
//   $env:API_URL="https://.../conecta"; $env:API_KEY="<chave>"; node scripts/teste-fluxo.mjs
//
// Sai com código 1 se alguma verificação falhar.

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const API_KEY = process.env.API_KEY ?? '';
const WAIT_MS = Number(process.env.WAIT_MS ?? 45000);

let failures = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FALHA ${label} ${detail}`);
  }
}

async function api(method, path, body) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (API_KEY) headers['Ocp-Apim-Subscription-Key'] = API_KEY;

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if ([502, 503, 504].includes(response.status) && attempt < 6) {
      console.log(`  ...   HTTP ${response.status} em ${method} ${path}, serviço acordando — nova tentativa em 10s`);
      await sleep(10000);
      continue;
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, data, headers: response.headers };
  }
}

/** Repete a consulta até a condição valer ou o tempo acabar (os eventos são assíncronos). */
async function waitFor(description, probe) {
  const deadline = Date.now() + WAIT_MS;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last.done) return last;
    await sleep(1500);
  }
  console.log(`  ...   tempo esgotado esperando: ${description}`);
  return last;
}

async function main() {
  const sku = `FLUXO-${Date.now().toString(36).toUpperCase()}`;
  console.log(`Alvo: ${API_URL}\n`);

  console.log('1. Produto');
  const product = await api('POST', '/products', { sku, name: 'Produto do teste de fluxo', category: 'Teste', price: 12.5, stock: 10 });
  check('POST /products responde 201', product.status === 201, `(veio ${product.status})`);
  check('produto nasce com estoque 10', product.data?.stock === 10);
  const productId = product.data?.id;
  if (!productId) throw new Error('Sem produto não dá para continuar.');

  console.log('\n2. Regras de negócio na criação do pedido');
  const tooMany = await api('POST', '/orders', { customerName: 'Teste', customerEmail: 'teste@exemplo.com', items: [{ productId, quantity: 11 }] });
  check('pedido acima do estoque responde 409 INSUFFICIENT_STOCK', tooMany.status === 409 && tooMany.data?.error?.code === 'INSUFFICIENT_STOCK', `(veio ${tooMany.status} ${tooMany.data?.error?.code})`);
  const invalid = await api('POST', '/orders', { customerName: '', customerEmail: 'x', items: [] });
  check('pedido inválido responde 400 VALIDATION_ERROR', invalid.status === 400 && invalid.data?.error?.code === 'VALIDATION_ERROR');

  console.log('\n3. Pedido');
  const placed = await api('POST', '/orders', {
    customerName: 'Cliente do Teste',
    customerEmail: 'cliente.teste@exemplo.com',
    // preço "malicioso" enviado de propósito: o BFF tem que ignorar
    items: [{ productId, quantity: 3, unitPrice: 0.01 }],
  });
  check('POST /orders responde 201', placed.status === 201, `(veio ${placed.status} ${JSON.stringify(placed.data?.error ?? '')})`);
  const order = placed.data?.order;
  check('pedido usa o preço oficial (3 x 12,50 = 37,50)', order?.total === 37.5, `(total ${order?.total})`);
  check('pedido nasce PENDENTE', order?.status === 'PENDENTE');
  check('resposta avisa que a baixa é por evento', placed.data?.stock?.mode === 'event-driven');
  if (!order?.id) throw new Error('Sem pedido não dá para continuar.');

  console.log('\n4. Evento order.created → estoque baixa');
  const created = await waitFor('evento order.created publicado', async () => {
    const events = await api('GET', '/events?limit=50');
    const event = events.data?.items?.find((item) => item.aggregateId === order.id && item.type === 'order.created');
    return { done: event?.status === 'PUBLICADO', event };
  });
  check('evento order.created aparece como PUBLICADO', created.done, `(status ${created.event?.status})`);

  const lowered = await waitFor('estoque em 7', async () => {
    const current = await api('GET', `/products/${productId}`);
    return { done: current.data?.stock === 7, stock: current.data?.stock };
  });
  check('estoque baixou de 10 para 7', lowered.done, `(estoque ${lowered.stock})`);

  const movements = await api('GET', `/products/${productId}/stock-movements`);
  const exit = movements.data?.items?.find((item) => item.type === 'SAIDA');
  check('movimentação SAIDA registrada com eventId', Boolean(exit?.eventId), `(eventId ${exit?.eventId})`);

  console.log('\n5. Máquina de estados');
  const invalidTransition = await api('PATCH', `/orders/${order.id}/status`, { status: 'ENTREGUE' });
  check('PENDENTE → ENTREGUE responde 409 INVALID_STATUS_TRANSITION', invalidTransition.status === 409 && invalidTransition.data?.error?.code === 'INVALID_STATUS_TRANSITION');
  const notDeletable = await api('DELETE', `/orders/${order.id}`);
  check('excluir pedido não cancelado responde 409 ORDER_NOT_DELETABLE', notDeletable.status === 409 && notDeletable.data?.error?.code === 'ORDER_NOT_DELETABLE');

  console.log('\n6. Cancelamento → evento order.cancelled → estoque volta');
  const cancelled = await api('PATCH', `/orders/${order.id}/status`, { status: 'CANCELADO' });
  check('PATCH status CANCELADO responde 200', cancelled.status === 200 && cancelled.data?.status === 'CANCELADO');
  const restored = await waitFor('estoque de volta em 10', async () => {
    const current = await api('GET', `/products/${productId}`);
    return { done: current.data?.stock === 10, stock: current.data?.stock };
  });
  check('estoque voltou para 10', restored.done, `(estoque ${restored.stock})`);

  console.log('\n7. Agregação');
  const aggregated = await api('GET', '/aggregated-data');
  check('GET /aggregated-data responde 200', aggregated.status === 200);
  check('as três fontes responderam ok', ['msProdutos', 'msPedidos', 'azureFunction'].every((name) => aggregated.data?.sources?.[name]?.status === 'ok'), JSON.stringify(aggregated.data?.sources));
  check('resposta não é parcial', aggregated.data?.partial === false);
  check('indicadores vieram da Azure Function', aggregated.data?.indicators?.computedBy === 'azure-function');
  check('cabeçalho x-correlation-id presente', Boolean(aggregated.headers.get('x-correlation-id')));
  check('cabeçalho Server-Timing presente', /ms-produtos;dur=\d+/.test(aggregated.headers.get('server-timing') ?? ''), `(${aggregated.headers.get('server-timing')})`);

  console.log('\n8. Limpeza');
  const deletedOrder = await api('DELETE', `/orders/${order.id}`);
  check('pedido cancelado pode ser excluído (204)', deletedOrder.status === 204);
  const deletedProduct = await api('DELETE', `/products/${productId}`);
  check('produto de teste excluído (204)', deletedProduct.status === 204);

  console.log(failures === 0 ? '\nFluxo completo OK.' : `\n${failures} verificação(ões) falharam.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nErro: ${error.message}`);
  process.exitCode = 1;
});
