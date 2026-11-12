// Definição de todos os diagramas do projeto (C4, implantação e sequência).
// Para alterar um diagrama, edite aqui e rode:  node scripts/gerar-diagramas.mjs
import { boxDiagram, sequenceDiagram } from './lib.mjs';

// ------------------------------------------------------------------ C4 nível 1: Contexto
const contexto = () =>
  boxDiagram({
    width: 1000,
    height: 680,
    title: 'C4 — Nível 1: Diagrama de Contexto',
    subtitle: 'Conecta Store: quem usa o sistema e com quais sistemas externos ele conversa',
    boxes: [
      { id: 'operador', kind: 'person', x: 60, y: 70, w: 230, h: 130, title: 'Operador da loja', tagLabel: 'Pessoa', text: 'Cadastra produtos, controla o estoque e registra os pedidos dos clientes.' },
      { id: 'time', kind: 'person', x: 710, y: 70, w: 230, h: 130, title: 'Equipe do projeto', tagLabel: 'Pessoa', text: 'Alunos que desenvolvem, publicam e monitoram a solução.' },
      { id: 'sistema', kind: 'system', x: 340, y: 285, w: 320, h: 140, title: 'Conecta Store', tagLabel: 'Sistema de software', text: 'Gestão de produtos, estoque e pedidos. Aplicação distribuída: microfrontend, API Gateway, BFF, dois microserviços e Azure Function.' },
      { id: 'atlas', kind: 'external', x: 60, y: 520, w: 230, h: 115, title: 'MongoDB Atlas', text: 'Banco de documentos gerenciado (camada gratuita M0). Guarda produtos e movimentações de estoque.' },
      { id: 'dockerhub', kind: 'external', x: 385, y: 520, w: 230, h: 115, title: 'Docker Hub', text: 'Registro público das imagens do BFF e dos dois microserviços.' },
      { id: 'github', kind: 'external', x: 710, y: 520, w: 230, h: 115, title: 'GitHub', text: 'Repositórios públicos, GitHub Actions (testes e build das imagens) e GitHub Pages (hospeda o front).' },
    ],
    arrows: [
      { from: 'operador', to: 'sistema', label: 'Gerencia produtos e pedidos pelo navegador [HTTPS]', labelWidth: 170, labelDx: -30 },
      { from: 'time', to: 'sistema', label: 'Publica e acompanha (logs, Swagger, health)', labelWidth: 150, labelDx: -40 },
      { from: 'sistema', to: 'atlas', label: 'Lê e grava produtos [driver MongoDB / TLS]', labelWidth: 130, labelDx: -30 },
      { from: 'sistema', to: 'dockerhub', label: 'Baixa as imagens', fromSide: 'bottom', toSide: 'top' },
      { from: 'github', to: 'sistema', label: 'Entrega o front e dispara os deploys', labelWidth: 130, labelDx: 30 },
      { from: 'github', to: 'dockerhub', label: 'Publica imagens (Actions)', fromSide: 'left', toSide: 'right', labelWidth: 80 },
      { from: 'time', to: 'github', label: 'git push', fromSide: 'bottom', toSide: 'top', fromOffset: 60, toOffset: 60 },
    ],
  });

// ------------------------------------------------------------------ C4 nível 2: Containers
const containers = () =>
  boxDiagram({
    width: 1100,
    height: 810,
    title: 'C4 — Nível 2: Diagrama de Containers',
    subtitle: 'Fluxo principal: Microfrontend → API Gateway → BFF → (ms-produtos, ms-pedidos, Azure Function). Linha tracejada = assíncrono (eventos)',
    boxes: [
      { id: 'operador', kind: 'person', x: 20, y: 62, w: 190, h: 105, title: 'Operador da loja', tagLabel: 'Pessoa' },
      { id: 'mfe', kind: 'container', x: 20, y: 240, w: 190, h: 150, title: 'Microfrontend', tech: 'React + Vite, Module Federation', text: 'Shell + remotes de Produtos e Pedidos, no GitHub Pages. Só conhece a URL do gateway.' },
      { id: 'gateway', kind: 'container', x: 320, y: 240, w: 190, h: 150, title: 'API Gateway', tech: 'Azure API Management (Consumption)', text: 'Entrada única: subscription key, rate limit, CORS e x-gateway-secret.' },
      { id: 'bff', kind: 'container', x: 620, y: 240, w: 200, h: 150, title: 'BFF', tech: 'Node.js + Express, Azure Container Apps', text: 'GET /aggregated-data, orquestra a criação de pedidos e faz proxy do CRUD. Sem banco.' },
      { id: 'produtos', kind: 'container', x: 320, y: 470, w: 190, h: 140, title: 'ms-produtos', tech: 'Node.js + Express, Azure Container Apps', text: 'Produtos e movimentações de estoque (idempotentes por eventId).' },
      { id: 'function', kind: 'container', x: 620, y: 470, w: 200, h: 140, title: 'Azure Function', tech: 'Node.js, Flex Consumption', text: 'HTTP Trigger: calcula indicadores. Queue Trigger: aplica eventos de pedido no estoque.' },
      { id: 'pedidos', kind: 'container', x: 900, y: 470, w: 190, h: 140, title: 'ms-pedidos', tech: 'Node.js + Express, Azure Container Apps', text: 'Pedidos, máquina de estados e Transactional Outbox.' },
      { id: 'mongo', kind: 'database', x: 320, y: 685, w: 190, h: 95, title: 'MongoDB Atlas', tech: 'products, stock_movements', tagLabel: 'Documentos' },
      { id: 'fila', kind: 'queue', x: 620, y: 695, w: 200, h: 75, title: 'order-events', tech: 'Azure Storage Queue', tagLabel: 'Fila' },
      { id: 'sql', kind: 'database', x: 900, y: 685, w: 190, h: 95, title: 'Azure SQL Database', tech: 'Orders, OrderItems, OutboxMessages', tagLabel: 'SQL' },
    ],
    arrows: [
      { from: 'operador', to: 'mfe', label: 'Usa [HTTPS]' },
      { from: 'mfe', to: 'gateway', label: 'JSON/HTTPS + subscription key', labelWidth: 84 },
      { from: 'gateway', to: 'bff', label: 'Repassa + x-gateway-secret', labelWidth: 84 },
      { from: 'bff', to: 'function', label: 'POST /api/indicators [x-functions-key]', labelWidth: 130 },
      { from: 'bff', to: 'produtos', label: 'REST [x-api-key]', fromSide: 'bottom', fromOffset: -70, toSide: 'top', via: [{ x: 650, y: 430 }, { x: 415, y: 430 }], labelWidth: 120 },
      { from: 'bff', to: 'pedidos', label: 'REST [x-api-key]', fromSide: 'right', toSide: 'top', via: [{ x: 995, y: 315 }], labelWidth: 120 },
      { from: 'produtos', to: 'mongo', label: 'Driver MongoDB [TLS]', labelWidth: 120 },
      { from: 'pedidos', to: 'sql', label: 'T-SQL: pedido + outbox na mesma transação', labelWidth: 150 },
      { from: 'function', to: 'produtos', label: 'Registra a movimentação de estoque', dashed: true, labelWidth: 84 },
      { from: 'pedidos', to: 'fila', label: 'Publica eventos de pedido', dashed: true, fromSide: 'left', fromOffset: 40, toSide: 'right', via: [{ x: 860, y: 580 }, { x: 860, y: 732 }], labelWidth: 60, labelDy: 14 },
      { from: 'fila', to: 'function', label: 'Queue Trigger', dashed: true },
    ],
  });

// ------------------------------------------------------------------ C4 nível 3: Componentes (genérico por camadas)
function componentes({ titulo, subtitulo, api, application, domain, infrastructure, externos }) {
  const col = (items, x, y, w, h, gap = 12) =>
    items.map((item, index) => ({ kind: 'component', tagLabel: '', x, y: y + (item.row ?? index) * (h + gap), w, h, ...item }));

  const layerTop = 68;
  const layerH = (count) => count * 90 + 36;
  const infraTop = layerTop + layerH(domain.length) + 24;

  const apiBoxes = col(api, 30, 110, 195, 78);
  const appBoxes = col(application, 310, 110, 210, 78);
  const domainBoxes = col(domain, 622, 110, 196, 78);
  const infraBoxes = col(infrastructure, 622, infraTop + 42, 196, 78);
  const extBoxes = col(externos, 885, infraTop + 42, 195, 78);

  const rows = Math.max(api.length, application.length, domain.length + infrastructure.length + 0.7);
  const height = 110 + rows * 90 + 50;

  const boxes = [
    { id: 'L-api', kind: 'layer', x: 20, y: layerTop, w: 215, h: layerH(api.length), title: 'API', text: 'adaptadores de entrada' },
    { id: 'L-app', kind: 'layer', x: 300, y: layerTop, w: 230, h: layerH(application.length), title: 'Application', text: 'casos de uso (slices) e portas' },
    { id: 'L-dom', kind: 'layer', x: 610, y: layerTop, w: 220, h: layerH(domain.length), title: 'Domain', text: 'regras puras, sem pacotes' },
    { id: 'L-inf', kind: 'layer', x: 610, y: infraTop, w: 220, h: layerH(infrastructure.length), title: 'Infrastructure', text: 'implementa as portas' },
    ...apiBoxes,
    ...appBoxes,
    ...domainBoxes,
    ...infraBoxes,
    ...extBoxes.map((box) => ({ ...box, kind: box.kind ?? 'external' })),
  ];

  // as setas entre camadas saem numa altura fixa, para não depender de quantas caixas cada camada tem
  const offsetTo = (y, top, count) => y - (top + layerH(count) / 2);
  const yCall = 150;
  const yImplFrom = infraTop + 62;
  const yImplTo = Math.min(yImplFrom, layerTop + layerH(application.length) - 30);

  const arrows = [
    { from: 'L-api', to: 'L-app', label: 'chama os handlers', fromSide: 'right', toSide: 'left', fromOffset: offsetTo(yCall, layerTop, api.length), toOffset: offsetTo(yCall, layerTop, application.length), labelWidth: 50 },
    { from: 'L-app', to: 'L-dom', label: 'usa', fromSide: 'right', toSide: 'left', fromOffset: offsetTo(yCall, layerTop, application.length), toOffset: offsetTo(yCall, layerTop, domain.length) },
    { from: 'L-inf', to: 'L-app', label: 'implementa as portas', fromSide: 'left', toSide: 'right', fromOffset: offsetTo(yImplFrom, infraTop, infrastructure.length), toOffset: offsetTo(yImplTo, layerTop, application.length), dashed: true, labelWidth: 62 },
    ...infrastructure
      .filter((item) => item.usa)
      .map((item) => ({ from: item.id, to: item.usa, label: item.como ?? '', fromSide: 'right', toSide: 'left', labelWidth: 40 })),
  ];

  return boxDiagram({ width: 1100, height, title: titulo, subtitle: subtitulo, boxes, arrows, legend: false });
}

const componentesBff = () =>
  componentes({
    titulo: 'C4 — Nível 3: Componentes do BFF',
    subtitulo: 'main.ts (composition root) é o único arquivo que conhece Infrastructure e API ao mesmo tempo',
    api: [
      { id: 'a1', title: 'Middlewares', text: 'correlationId, gatewaySecret, rate limit, CORS, errorHandler' },
      { id: 'a2', title: 'GetAggregatedDataEndpoint', text: 'GET /aggregated-data + Server-Timing' },
      { id: 'a3', title: 'PlaceOrderEndpoint', text: 'POST /orders' },
      { id: 'a4', title: 'ProductsProxyEndpoint / OrdersProxyEndpoint', text: 'CRUD de /products, /orders e /events' },
      { id: 'a5', title: 'OpenAPI + Swagger UI', text: '/docs e /openapi.json (importado no gateway)' },
    ],
    application: [
      { id: 'p1', title: 'GetAggregatedDataHandler', text: 'consulta em paralelo, tolera falha parcial' },
      { id: 'p2', title: 'PlaceOrderHandler', text: 'catálogo → estoque → cria pedido' },
      { id: 'p3', title: 'ProductsProxyHandler / OrdersProxyHandler', text: 'filtra parâmetros e repassa' },
      { id: 'p4', title: 'CheckHealthHandler', text: 'saúde de cada dependência' },
      { id: 'p5', title: 'Portas', text: 'ProductsApi, OrdersApi, IndicatorsApi' },
    ],
    domain: [
      { id: 'd1', title: 'orderDraft', text: 'preço oficial, soma repetidos, confere estoque' },
      { id: 'd2', title: 'errors / models', text: 'UpstreamError, ConflictError, Product, Order' },
    ],
    infrastructure: [
      { id: 'i1', title: 'ProdutosHttpApi', text: 'implementa ProductsApi', usa: 'e1', como: 'REST' },
      { id: 'i2', title: 'PedidosHttpApi', text: 'implementa OrdersApi', usa: 'e2', como: 'REST' },
      { id: 'i3', title: 'IndicatorsFunctionApi', text: 'implementa IndicatorsApi', usa: 'e3', como: 'HTTP' },
      { id: 'i4', title: 'HttpJsonClient / config / logger', text: 'fetch + timeout + correlation-id; variáveis de ambiente; pino' },
    ],
    externos: [
      { id: 'e1', title: 'ms-produtos', kind: 'container', text: 'MongoDB Atlas' },
      { id: 'e2', title: 'ms-pedidos', kind: 'container', text: 'Azure SQL' },
      { id: 'e3', title: 'Azure Function', kind: 'container', text: 'calculateIndicators' },
    ],
  });

const componentesPedidos = () =>
  componentes({
    titulo: 'C4 — Nível 3: Componentes do ms-pedidos',
    subtitulo: 'Pedido e evento são gravados na mesma transação (Transactional Outbox); o relay publica na fila',
    api: [
      { id: 'a1', title: 'Middlewares', text: 'correlationId, apiKey (x-api-key), errorHandler' },
      { id: 'a2', title: 'Endpoints de pedido', text: 'CreateOrder, ListOrders, GetOrder, UpdateOrder, ChangeOrderStatus, DeleteOrder' },
      { id: 'a3', title: 'Endpoints de evento', text: 'ListOrderEvents (GET /events), DispatchOrderEvents' },
      { id: 'a4', title: 'OpenAPI + AsyncAPI', text: '/docs, /events/docs, /events/asyncapi.yaml' },
    ],
    application: [
      { id: 'p1', title: 'CreateOrderHandler', text: 'cria o pedido e grava order.created no outbox' },
      { id: 'p2', title: 'ChangeOrderStatusHandler', text: 'transição + concorrência otimista; cancelar grava order.cancelled' },
      { id: 'p3', title: 'Demais handlers', text: 'List, Get, Update, Delete, ListOrderEvents, DispatchOrderEvents' },
      { id: 'p4', title: 'Portas', text: 'OrderRepository, OutboxRepository, EventPublisher, sinal do relay' },
    ],
    domain: [
      { id: 'd1', title: 'Order (agregado)', text: 'itens, total, máquina de estados, pullEvents()' },
      { id: 'd2', title: 'OrderEvent / errors', text: 'order.created, order.cancelled; erros de regra' },
    ],
    infrastructure: [
      { id: 'i1', title: 'Repositório SQL + migração', text: 'mssql; transação pedido + outbox; retry de conexão', usa: 'e1', como: 'T-SQL' },
      { id: 'i2', title: 'OutboxRelay', text: 'acionado por sinal; publica pendentes e marca como processado' },
      { id: 'i3', title: 'AzureQueueEventPublisher', text: 'mensagem JSON em Base64', usa: 'e2', como: 'SDK da fila' },
    ],
    externos: [
      { id: 'e1', title: 'Azure SQL Database', kind: 'database', text: '' },
      { id: 'e2', title: 'order-events', kind: 'queue', text: '', row: 2 },
    ],
  });

const componentesProdutos = () =>
  componentes({
    titulo: 'C4 — Nível 3: Componentes do ms-produtos',
    subtitulo: 'O estoque só muda por movimentação; cada movimentação pode levar um eventId para ser idempotente',
    api: [
      { id: 'a1', title: 'Middlewares', text: 'correlationId, apiKey (x-api-key), errorHandler' },
      { id: 'a2', title: 'Endpoints de produto', text: 'CreateProduct, ListProducts, GetProduct, UpdateProduct, DeleteProduct' },
      { id: 'a3', title: 'Endpoints de estoque', text: 'RegisterStockMovement, ListStockMovements' },
      { id: 'a4', title: 'OpenAPI + Swagger UI', text: '/docs e /openapi.json' },
    ],
    application: [
      { id: 'p1', title: 'Handlers de produto', text: 'Create, List, Get, Update, Delete' },
      { id: 'p2', title: 'RegisterStockMovementHandler', text: '201 aplica, 200 se o eventId já foi usado, 409 sem saldo' },
      { id: 'p3', title: 'ListStockMovementsHandler', text: 'histórico do produto' },
      { id: 'p4', title: 'Portas', text: 'ProductRepository, StockMovementRepository' },
    ],
    domain: [
      { id: 'd1', title: 'Product', text: 'SKU, preço, estoque, lowStock (≤ 5)' },
      { id: 'd2', title: 'StockMovement / errors', text: 'ENTRADA, SAIDA, saldo após a movimentação' },
    ],
    infrastructure: [
      { id: 'i1', title: 'Repositórios MongoDB', text: 'índice único de SKU e de eventId; baixa atômica com $inc condicional', usa: 'e1', como: 'driver' },
      { id: 'i2', title: 'Repositórios em memória', text: 'mesmo contrato, para testes e demonstração local' },
      { id: 'i3', title: 'config / logger', text: 'variáveis de ambiente; pino' },
    ],
    externos: [{ id: 'e1', title: 'MongoDB Atlas', kind: 'database', text: '' }],
  });

const componentesFunction = () =>
  componentes({
    titulo: 'C4 — Nível 3: Componentes da Azure Function',
    subtitulo: 'Mesma separação em camadas dos serviços; os gatilhos (HTTP e fila) são os adaptadores de entrada',
    api: [
      { id: 'a1', title: 'CalculateIndicatorsEndpoint', text: 'HTTP Trigger POST /api/indicators (authLevel function)' },
      { id: 'a2', title: 'ProcessOrderEventEndpoint', text: 'Queue Trigger da fila order-events' },
      { id: 'a3', title: 'health / openapi / docs', text: 'HTTP anônimo: /api/health, /api/docs' },
    ],
    application: [
      { id: 'p1', title: 'CalculateIndicatorsHandler', text: 'valida a entrada e calcula os indicadores' },
      { id: 'p2', title: 'ProcessOrderEventHandler', text: 'evento → movimentações; decide o que relança para retry' },
      { id: 'p3', title: 'Porta StockGateway', text: 'registrar movimentação de estoque' },
    ],
    domain: [
      { id: 'd1', title: 'indicators', text: 'faturamento, ticket médio, top produtos, alertas' },
      { id: 'd2', title: 'orderEvent', text: 'order.created → SAÍDA; order.cancelled → ENTRADA' },
    ],
    infrastructure: [
      { id: 'i1', title: 'ProdutosHttpStockGateway', text: 'fetch + timeout + x-api-key + eventId', usa: 'e1', como: 'REST' },
      { id: 'i2', title: 'config', text: 'app settings' },
    ],
    externos: [{ id: 'e1', title: 'ms-produtos', kind: 'container', text: 'POST /products/{id}/stock-movements' }],
  });

// ------------------------------------------------------------------ Visão de implantação
const implantacao = () =>
  boxDiagram({
    width: 1100,
    height: 640,
    title: 'Visão de implantação',
    subtitle: 'Onde cada parte roda na nuvem — tudo em camadas gratuitas ou de consumo',
    boxes: [
      { id: 'gh', kind: 'layer', x: 20, y: 70, w: 250, h: 330, title: 'GitHub', text: 'código, CI/CD e hospedagem do front' },
      { id: 'az', kind: 'layer', x: 300, y: 70, w: 780, h: 440, title: 'Microsoft Azure — resource group rg-pjbl', text: 'criado por infra/deploy-azure.ps1' },
      { id: 'aca', kind: 'layer', x: 520, y: 130, w: 330, h: 290, title: 'Container Apps (ambiente cae-pjbl)', text: 'imagens do Docker Hub, escala 0–1' },
      { id: 'pages', kind: 'container', x: 40, y: 125, w: 210, h: 85, title: 'GitHub Pages', tagLabel: '', text: 'site estático: shell + /produtos + /pedidos' },
      { id: 'actions', kind: 'container', x: 40, y: 230, w: 210, h: 150, title: 'GitHub Actions', tagLabel: '', text: 'testes + arquitetura, build e push das imagens, deploy do front e da Function' },
      { id: 'apim', kind: 'container', x: 320, y: 215, w: 170, h: 100, title: 'API Management', tagLabel: '', text: 'Consumption. Policy: CORS, rate limit, secret' },
      { id: 'bff', kind: 'container', x: 540, y: 185, w: 290, h: 60, title: 'bff  (porta 3000)', tagLabel: '' },
      { id: 'produtos', kind: 'container', x: 540, y: 262, w: 290, h: 60, title: 'ms-produtos  (porta 3001)', tagLabel: '' },
      { id: 'pedidos', kind: 'container', x: 540, y: 339, w: 290, h: 60, title: 'ms-pedidos  (porta 3002)', tagLabel: '' },
      { id: 'func', kind: 'container', x: 880, y: 150, w: 180, h: 100, title: 'Function App', tagLabel: '', text: 'Flex Consumption, Node 22' },
      { id: 'storage', kind: 'queue', x: 880, y: 290, w: 180, h: 70, title: 'Storage Account', tagLabel: '', text: 'fila order-events' },
      { id: 'sql', kind: 'database', x: 880, y: 395, w: 180, h: 95, title: 'Azure SQL', tagLabel: '', text: 'serverless, oferta gratuita' },
      { id: 'hub', kind: 'external', x: 40, y: 430, w: 210, h: 80, title: 'Docker Hub', tagLabel: '', text: 'pjbl-bff, pjbl-ms-produtos, pjbl-ms-pedidos (tag v1)' },
      { id: 'atlas', kind: 'external', x: 560, y: 540, w: 250, h: 75, title: 'MongoDB Atlas (M0)', tagLabel: '', text: 'cluster gratuito, acesso por TLS' },
    ],
    arrows: [
      { from: 'pages', to: 'apim', label: 'HTTPS (navegador)', fromSide: 'right', toSide: 'top', via: [{ x: 405, y: 167 }], labelWidth: 110, labelDy: -9 },
      { from: 'apim', to: 'bff', label: '', toSide: 'left' },
      { from: 'actions', to: 'hub', label: 'docker push' },
      { from: 'hub', to: 'aca', label: 'pull das imagens', dashed: true, fromSide: 'right', toSide: 'bottom', toOffset: -120, via: [{ x: 430, y: 470 }], labelWidth: 100 },
      { from: 'pedidos', to: 'sql', label: '', toSide: 'left' },
      { from: 'pedidos', to: 'storage', label: '', toSide: 'left' },
      { from: 'storage', to: 'func', label: '' },
      { from: 'bff', to: 'func', label: '', toSide: 'left' },
      { from: 'produtos', to: 'atlas', label: 'TLS', via: [{ x: 510, y: 292 }, { x: 510, y: 577 }], fromSide: 'left', toSide: 'left', labelDx: -18 },
    ],
  });

// ------------------------------------------------------------------ Sequência: /aggregated-data
const seqAgregacao = () =>
  sequenceDiagram({
    title: 'Visão de runtime 1 — GET /aggregated-data',
    subtitle: 'O dashboard pede tudo de uma vez; o BFF consulta os dois microserviços em paralelo e depois a Function',
    participants: [
      { id: 'mfe', label: 'Microfrontend', kind: 'container' },
      { id: 'gw', label: 'API Gateway', kind: 'container' },
      { id: 'bff', label: 'BFF', kind: 'container' },
      { id: 'prod', label: 'ms-produtos', kind: 'container' },
      { id: 'ped', label: 'ms-pedidos', kind: 'container' },
      { id: 'fn', label: 'Azure Function', kind: 'container' },
    ],
    steps: [
      { from: 'mfe', to: 'gw', text: 'GET /aggregated-data + Ocp-Apim-Subscription-Key', num: 1 },
      { from: 'gw', to: 'gw', text: 'valida a chave, aplica rate limit' },
      { from: 'gw', to: 'bff', text: 'repassa com x-gateway-secret', num: 2 },
      { note: 'O BFF gera (ou reaproveita) o x-correlation-id e dispara as duas consultas ao mesmo tempo', over: ['bff', 'ped'] },
      { from: 'bff', to: 'prod', text: 'GET /products?pageSize=100', num: 3 },
      { from: 'bff', to: 'ped', text: 'GET /orders?pageSize=100  e  GET /events?limit=10', num: 3 },
      { from: 'prod', to: 'bff', text: 'produtos (MongoDB)', kind: 'reply' },
      { from: 'ped', to: 'bff', text: 'pedidos + eventos (Azure SQL)', kind: 'reply' },
      { from: 'bff', to: 'fn', text: 'POST /api/indicators { products, orders } + x-functions-key', num: 4 },
      { from: 'fn', to: 'bff', text: 'indicadores, top produtos e alertas', kind: 'reply' },
      { note: 'Se uma fonte falhar, o BFF não devolve erro: marca partial = true e segue com o que conseguiu', over: ['bff', 'fn'] },
      { from: 'bff', to: 'gw', text: '200 — JSON único + Server-Timing + x-correlation-id', kind: 'reply', num: 5 },
      { from: 'gw', to: 'mfe', text: '200 (cabeçalhos expostos via CORS)', kind: 'reply' },
    ],
  });

// ------------------------------------------------------------------ Sequência: pedido + evento
const seqEvento = () =>
  sequenceDiagram({
    title: 'Visão de runtime 2 — Criação de pedido e baixa de estoque por evento',
    subtitle: 'Parte síncrona (até o 201) e parte assíncrona (laranja): outbox → fila → Function → estoque',
    width: 1100,
    participants: [
      { id: 'mfe', label: 'Microfrontend', kind: 'container' },
      { id: 'bff', label: 'BFF (via gateway)', kind: 'container' },
      { id: 'prod', label: 'ms-produtos', kind: 'container' },
      { id: 'ped', label: 'ms-pedidos', kind: 'container' },
      { id: 'sql', label: 'Azure SQL', kind: 'database' },
      { id: 'fila', label: 'Fila order-events', kind: 'queue' },
      { id: 'fn', label: 'Azure Function', kind: 'container' },
    ],
    steps: [
      { from: 'mfe', to: 'bff', text: 'POST /orders { cliente, itens: [productId, quantity] }', num: 1 },
      { from: 'bff', to: 'prod', text: 'GET /products?ids=...', num: 2 },
      { from: 'prod', to: 'bff', text: 'nome, preço e estoque oficiais', kind: 'reply' },
      { from: 'bff', to: 'bff', text: 'confere estoque (409 se faltar)' },
      { from: 'bff', to: 'ped', text: 'POST /orders (com nome e preço oficiais)', num: 3 },
      { from: 'ped', to: 'sql', text: 'BEGIN; INSERT pedido + itens; INSERT OutboxMessages (order.created); COMMIT', num: 4 },
      { from: 'ped', to: 'bff', text: '201 pedido PENDENTE', kind: 'reply' },
      { from: 'bff', to: 'mfe', text: '201 { order, stock: { mode: "event-driven" } }', kind: 'reply', num: 5 },
      { note: 'A partir daqui é assíncrono. O relay do ms-pedidos é avisado logo após o commit.', over: ['ped', 'fn'] },
      { from: 'ped', to: 'sql', text: 'lê eventos pendentes do outbox', kind: 'async', num: 6 },
      { from: 'ped', to: 'fila', text: 'publica o evento (JSON em Base64)', kind: 'async', num: 7 },
      { from: 'ped', to: 'sql', text: 'marca ProcessedAt (status PUBLICADO)', kind: 'async' },
      { from: 'fila', to: 'fn', text: 'Queue Trigger: processOrderEvent', kind: 'async', num: 8 },
      { from: 'fn', to: 'prod', text: 'POST /products/{id}/stock-movements  SAIDA, eventId = "<eventId>:<productId>"', kind: 'async', num: 9 },
      { from: 'prod', to: 'fn', text: '201 aplicado  (ou 200 duplicate, se a mensagem for reentregue)', kind: 'reply' },
      { note: 'Cancelar o pedido segue o mesmo caminho com order.cancelled, e a Function registra uma ENTRADA (devolução).', over: ['ped', 'fn'] },
    ],
  });

export const DIAGRAMAS = {
  'c4-1-contexto': contexto,
  'c4-2-containers': containers,
  'c4-3-componentes-bff': componentesBff,
  'c4-3-componentes-ms-pedidos': componentesPedidos,
  'c4-3-componentes-ms-produtos': componentesProdutos,
  'c4-3-componentes-function': componentesFunction,
  implantacao,
  'runtime-1-aggregated-data': seqAgregacao,
  'runtime-2-pedido-evento': seqEvento,
};
