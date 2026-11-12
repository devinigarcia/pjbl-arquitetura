# Contratos entre os serviços — Conecta Store

Este documento é a "fonte da verdade" dos contratos HTTP e de eventos do projeto. Cada repositório
implementa a sua parte; se algo mudar aqui, precisa mudar nos dois lados.

Fluxo: **Microfrontend → API Gateway → BFF → (ms-produtos, ms-pedidos, Azure Function)**.

## 1. Convenções que valem para todos os serviços HTTP

- JSON em `camelCase`, datas em ISO 8601 (UTC), dinheiro como número com 2 casas.
- Cabeçalho `x-correlation-id`: se vier na requisição é reaproveitado, senão o serviço gera um UUID.
  Sempre volta na resposta e é repassado nas chamadas para outros serviços.
- Erro padrão:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos.", "details": [{ "field": "price", "message": "Deve ser maior que zero." }], "correlationId": "..." } }
```

| Situação | HTTP | `code` |
|---|---|---|
| Corpo/consulta inválidos | 400 | `VALIDATION_ERROR` (com `details`) |
| JSON malformado | 400 | `INVALID_JSON` |
| Chave interna ausente/errada | 401 | `UNAUTHORIZED` |
| Recurso não existe | 404 | `<RECURSO>_NOT_FOUND` |
| Rota não existe | 404 | `ROUTE_NOT_FOUND` |
| Conflito | 409 | código específico |
| Regra de negócio | 422 | código específico |
| Erro inesperado | 500 | `INTERNAL_ERROR` |

- `GET /health` (sem autenticação), `GET /docs` (Swagger UI), `GET /openapi.json`, `GET /` redireciona para `/docs`.
- Mensagens de erro em português; códigos, rotas e campos em inglês.
- `INTERNAL_API_KEY`: quando definida, o microserviço exige o cabeçalho `x-api-key` (menos em `/health`, `/docs`, `/openapi.json` e, no ms-pedidos, nas páginas `/events/docs` e `/events/asyncapi.*`).

## 2. ms-produtos (porta 3001, MongoDB)

Produto:

```json
{ "id": "uuid", "sku": "CAFE-500G", "name": "Café torrado 500g", "description": "", "category": "Mercearia",
  "price": 24.9, "stock": 12, "lowStock": false, "createdAt": "...", "updatedAt": "..." }
```

Movimentação de estoque:

```json
{ "id": "uuid", "productId": "uuid", "type": "ENTRADA", "quantity": 10, "reason": "Estoque inicial",
  "eventId": null, "balanceAfter": 10, "createdAt": "..." }
```

| Método e rota | Corpo / consulta | Resposta |
|---|---|---|
| `POST /products` | `{ sku, name, description?, category, price, stock? }` (`stock` = estoque inicial, padrão 0) | 201 produto + `Location`; 409 `SKU_ALREADY_EXISTS` |
| `GET /products` | `?search&category&ids=a,b&page=1&pageSize=20` (máx. 100) | 200 `{ items, total, page, pageSize }` |
| `GET /products/:id` | — | 200 produto; 404 `PRODUCT_NOT_FOUND` |
| `PUT /products/:id` | `{ sku?, name, description?, category, price }` (não mexe em estoque) | 200 produto; 409 `SKU_ALREADY_EXISTS` |
| `DELETE /products/:id` | — | 204 (apaga as movimentações junto) |
| `POST /products/:id/stock-movements` | `{ type: "ENTRADA"\|"SAIDA", quantity, reason?, eventId? }` | 201 `{ movement, product, duplicate: false }`; 200 `{ movement, product, duplicate: true }` se o `eventId` já foi aplicado; 409 `INSUFFICIENT_STOCK` |
| `GET /products/:id/stock-movements` | `?limit=50` (máx. 200) | 200 `{ items, total }` (mais recentes primeiro) |
| `GET /health` | — | `{ status: "ok", service: "ms-produtos", database: "mongo"\|"memory", uptime, timestamp }` |

## 3. ms-pedidos (porta 3002, Azure SQL)

Pedido (o campo `allowedTransitions` vem em toda resposta que devolve um pedido, inclusive na listagem):

```json
{ "id": "uuid", "customerName": "Ana Souza", "customerEmail": "ana@exemplo.com", "status": "PENDENTE",
  "items": [{ "productId": "uuid", "productName": "Café torrado 500g", "unitPrice": 24.9, "quantity": 2, "subtotal": 49.8 }],
  "total": 49.8, "itemCount": 2, "notes": null, "allowedTransitions": ["PAGO", "CANCELADO"],
  "createdAt": "...", "updatedAt": "..." }
```

`itemCount` é a soma das quantidades.

| Método e rota | Corpo / consulta | Resposta |
|---|---|---|
| `POST /orders` | `{ customerName, customerEmail, notes?, items: [{ productId, productName, unitPrice, quantity }] }` | 201 pedido + `Location`; 422 `DUPLICATED_ITEM` |
| `GET /orders` | `?status&search&page=1&pageSize=20` (máx. 100) | 200 `{ items, total, page, pageSize }` (mais recentes primeiro) |
| `GET /orders/:id` | — | 200 pedido; 404 `ORDER_NOT_FOUND` (id que não é UUID também dá 404) |
| `PUT /orders/:id` | `{ customerName, customerEmail, notes? }` | 200 pedido; 409 `ORDER_NOT_EDITABLE` se não estiver PENDENTE |
| `PATCH /orders/:id/status` | `{ status }` | 200 pedido; 409 `INVALID_STATUS_TRANSITION`; 409 `CONCURRENT_UPDATE` |
| `DELETE /orders/:id` | — | 204; 409 `ORDER_NOT_DELETABLE` se não estiver CANCELADO |
| `GET /events` | `?limit=20` (máx. 100) | 200 `{ items: [OutboxItem], total }` (mais recentes primeiro) |
| `POST /events/dispatch` | — | 200 `{ published, failed, pending }` |
| `GET /events/docs` | — | página AsyncAPI renderizada |
| `GET /events/asyncapi.yaml` e `.json` | — | especificação AsyncAPI 2.6.0 |
| `GET /health` | — | `{ status: "ok", service: "ms-pedidos", database: "sql"\|"memory", publisher: "azure-queue"\|"log", uptime, timestamp }` |

Máquina de estados: `PENDENTE → PAGO | CANCELADO`, `PAGO → ENVIADO | CANCELADO`, `ENVIADO → ENTREGUE`.
`ENTREGUE` e `CANCELADO` são finais.

OutboxItem:

```json
{ "id": "uuid (= eventId)", "type": "order.created", "aggregateId": "uuid do pedido", "occurredAt": "...",
  "processedAt": "... ou null", "attempts": 1, "lastError": null,
  "status": "PUBLICADO", "payload": { "...evento completo..." } }
```

`status`: `PUBLICADO` (tem `processedAt`), `FALHOU` (sem `processedAt` e com `lastError`), `PENDENTE` (o resto).

## 4. Evento de pedido (fila `order-events`, Azure Storage Queue)

Mensagem = JSON abaixo codificado em **Base64**. Entrega *at-least-once*.

```json
{ "eventId": "uuid", "type": "order.created", "version": 1, "source": "ms-pedidos",
  "occurredAt": "...", "correlationId": "...",
  "data": { "orderId": "uuid", "customerName": "...", "customerEmail": "...", "status": "PENDENTE", "total": 49.8,
            "items": [{ "productId": "uuid", "productName": "...", "quantity": 2, "unitPrice": 24.9 }] } }
```

- `order.created` → publicado ao criar o pedido. A Function registra uma **SAÍDA** por item.
- `order.cancelled` → publicado quando o pedido vai para `CANCELADO`. A Function registra uma **ENTRADA** por item.
- A Function chama `POST /products/{productId}/stock-movements` com
  `{ type, quantity, reason, eventId: "<eventId>:<productId>" }`, cabeçalhos `x-api-key` e `x-correlation-id`.
  `reason`: `"Pedido <orderId> criado"` ou `"Pedido <orderId> cancelado (devolução)"`.

## 5. Azure Function

| Função | Gatilho | Rota |
|---|---|---|
| `calculateIndicators` | HTTP POST, `authLevel: function` (`x-functions-key`) | `/api/indicators` |
| `processOrderEvent` | Storage Queue `order-events` | — |
| `health` | HTTP GET anônimo | `/api/health` |
| `openapi` / `docs` | HTTP GET anônimo | `/api/openapi.json`, `/api/docs` |

`POST /api/indicators` recebe `{ products: Produto[], orders: Pedido[] }` e devolve:

```json
{ "products": { "total": 8, "totalUnitsInStock": 120, "inventoryValue": 3500.5,
                "lowStock": [{ "id": "...", "sku": "...", "name": "...", "stock": 3 }], "outOfStock": 1,
                "byCategory": [{ "category": "Mercearia", "count": 3, "units": 40, "value": 900 }] },
  "orders": { "total": 5, "byStatus": { "PENDENTE": 1, "PAGO": 1, "ENVIADO": 1, "ENTREGUE": 1, "CANCELADO": 1 },
              "revenue": 300, "averageTicket": 100, "pendingValue": 49.8, "cancellationRate": 0.2 },
  "topProducts": [{ "productId": "...", "productName": "...", "quantity": 7, "revenue": 174.3 }],
  "alerts": ["2 produtos estão com estoque baixo."],
  "generatedAt": "...", "computedBy": "azure-function" }
```

- `revenue` = soma dos pedidos PAGO + ENVIADO + ENTREGUE; `averageTicket` = `revenue` / quantidade desses pedidos;
  `pendingValue` = soma dos PENDENTE; `cancellationRate` = cancelados / total (0 a 1).
- `topProducts` = 5 produtos com mais unidades vendidas (ignora pedidos cancelados).
- `GET /api/health` → `{ status: "ok", service: "pjbl-function", timestamp }`.

## 6. BFF (porta 3000)

Sem banco. Exposto ao front **somente via API Gateway**.

### `GET /aggregated-data`

```json
{ "generatedAt": "...", "correlationId": "...", "partial": false, "totalDurationMs": 180,
  "products": { "items": ["Produto"], "total": 8 },
  "orders": { "items": ["Pedido"], "total": 5 },
  "recentEvents": ["OutboxItem"],
  "indicators": { "...resposta da Function..." },
  "sources": { "msProdutos": { "status": "ok", "durationMs": 40 },
               "msPedidos": { "status": "ok", "durationMs": 55 },
               "azureFunction": { "status": "ok", "durationMs": 90 } } }
```

- `status` de cada fonte: `ok`, `error` (com `error: "mensagem"`) ou `skipped` (a Function é pulada quando
  produtos **e** pedidos falharam ou quando `FUNCTION_URL` não está configurada).
- Se alguma fonte falhar: `partial: true`, o bloco correspondente vira `null` (`recentEvents` vira `[]`) e o HTTP continua 200.
- Cabeçalhos: `Server-Timing: ms-produtos;dur=40, ms-pedidos;dur=55, azure-function;dur=90, total;dur=180` e `Cache-Control: no-store`.

### `POST /orders` (orquestrado)

Entrada: `{ customerName, customerEmail, notes?, items: [{ productId, quantity }] }`.
O BFF busca os produtos, usa nome e preço oficiais, soma itens repetidos e confere o estoque.

- 201 `{ "order": Pedido, "stock": { "mode": "event-driven", "message": "..." } }`
- 422 `PRODUCT_NOT_FOUND` (`details: [{ productId }]`)
- 409 `INSUFFICIENT_STOCK` (`details: [{ productId, productName, requested, available }]`)

### Proxies (mesmos corpos e respostas dos microserviços)

`GET/POST /products`, `GET/PUT/DELETE /products/:id`, `GET/POST /products/:id/stock-movements`,
`GET /orders`, `GET/PUT/DELETE /orders/:id`, `PATCH /orders/:id/status`, `GET /events`.

### Erros e segurança

- 4xx dos microserviços são repassados como vieram; falha de rede/5xx → 502 `UPSTREAM_UNAVAILABLE`; timeout → 504 `UPSTREAM_TIMEOUT`.
- `GATEWAY_SECRET`: quando definido, só aceita requisições com `x-gateway-secret` igual (o API Gateway injeta),
  menos `/health`, `/docs`, `/openapi.json` e `OPTIONS`. Sem o cabeçalho → 401 `UNAUTHORIZED`.
- CORS expõe `x-correlation-id`, `server-timing`, `location`. Resposta sempre leva `x-served-by: pjbl-bff`.
- `GET /health` → `{ status: "ok"|"degraded", service: "pjbl-bff", dependencies: { msProdutos, msPedidos, azureFunction: { status: "ok"|"error"|"skipped", durationMs } }, timestamp }`.

## 7. API Gateway → front

O front chama `VITE_API_URL` (URL do gateway) e manda `Ocp-Apim-Subscription-Key: <VITE_API_KEY>` quando a chave existe.
O gateway acrescenta `x-gateway-secret` e `x-gateway: apim` antes de repassar ao BFF.

## 8. Placeholders usados nos READMEs e documentos

Trocados pelo `scripts/preencher-links.mjs` do repositório `pjbl-arquitetura`:

`{{ALUNOS}}`, `{{GITHUB_USER}}`, `{{DOCKERHUB_USER}}`, `{{URL_FRONTEND}}`, `{{URL_GATEWAY}}`, `{{URL_BFF}}`,
`{{URL_MS_PRODUTOS}}`, `{{URL_MS_PEDIDOS}}`, `{{URL_FUNCTION}}`, `{{URL_VIDEO}}`.
