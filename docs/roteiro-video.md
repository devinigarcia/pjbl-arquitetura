# Roteiro do vídeo — Conecta Store

Duração alvo: **10 a 12 minutos**. O enunciado pede duas coisas que não podem faltar:

1. **Todos do grupo falam**, e isso tem que ficar explícito — por isso cada bloco começa com a pessoa dizendo o próprio nome.
2. **Só URLs da nuvem.** Nada de `localhost` na tela (a única exceção é o terminal, no bloco dos testes).

Integrantes:

- Arthur Ambrozewicz Cidral
- Erick Marlon Barbieri da Silva
- Luan Alberti Estevinho
- Vinícius de Oliveira Garcia

## Antes de gravar (checklist)

- [ ] Subir com `./infra/deploy-azure.ps1 ... -MinReplicas 1` para os containers não "dormirem" durante a gravação.
- [ ] "Aquecer" o sistema: abrir o front e esperar o painel carregar com as três fontes em verde (o banco SQL gratuito leva até 1 minuto para acordar na primeira chamada).
- [ ] Rodar `node scripts/seed.mjs` para ter produtos e pedidos.
- [ ] Deixar abertas, em abas, nesta ordem:
  1. PDF da entrega na página do C4 nível 2 (Containers)
  2. Frontend — https://devinigarcia.github.io/pjbl-microfrontend
  3. Swagger do BFF — https://bff.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/docs
  4. Swagger do ms-produtos — https://ms-produtos.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/docs
  5. Swagger do ms-pedidos — https://ms-pedidos.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/docs
  6. Eventos (AsyncAPI) — https://ms-pedidos.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/events/docs
  7. Swagger da Function — https://func-pjbl-0a42b2.azurewebsites.net/api/docs
  8. MongoDB Atlas → *Browse Collections* → banco `pjbl_produtos`
  9. Portal Azure → banco `pjbl-pedidos` → *Query editor*
  10. Portal Azure → Function App → `processOrderEvent` → *Invocations* (ou *Log stream*)
  11. Portal Azure → API Management → API "Conecta Store BFF" → *Design* (policy)
  12. Docker Hub — https://hub.docker.com/u/vinigarciaa
  13. GitHub — https://github.com/devinigarcia/pjbl-bff/actions
- [ ] No navegador do front, abrir o DevTools (F12) na aba **Network**, com o filtro *Fetch/XHR*.
- [ ] Um terminal aberto na pasta `pjbl-bff` (para o bloco dos testes).
- [ ] Esconder a subscription key e qualquer segredo antes de compartilhar a tela (no DevTools ela aparece no cabeçalho `Ocp-Apim-Subscription-Key`: não dê zoom nela).

## Divisão

O roteiro tem **quatro blocos** com tempo parecido, um para cada integrante. A divisão abaixo é uma sugestão:
se preferirem trocar quem apresenta o quê, é só trocar os nomes — o importante é cada um dizer o próprio nome ao começar.

| Bloco | Quem | Tema | Tempo |
|---|---|---|---|
| 1 | Vinícius | Arquitetura e o caminho de uma requisição | ~2min30 |
| 2 | Arthur | CRUD de produtos (MongoDB) e de pedidos (Azure SQL) com as regras de negócio | ~3min |
| 3 | Erick | Eventos: outbox → fila → Function → estoque; `/aggregated-data` | ~3min |
| 4 | Luan | Swagger, gateway, Docker Hub, GitHub Actions e testes de arquitetura | ~3min |

---

## Bloco 1 — Arquitetura e caminho da requisição (Vinícius)

**Fala de abertura:** "Olá, eu sou **Vinícius**, e este é o Conecta Store, o projeto PJBL do nosso grupo. Comigo estão
**Arthur**, **Erick** e **Luan**, que vão se apresentar ao longo do vídeo. Eu vou mostrar a arquitetura e como
uma chamada atravessa o sistema."

| Tela | O que mostrar | O que dizer |
|---|---|---|
| PDF — C4 Containers | Passar o mouse pelo caminho Microfrontend → Gateway → BFF → serviços | "O front só conhece o API Gateway. O gateway repassa para o BFF, e o BFF fala com os dois microserviços e com a Azure Function. O ms-produtos usa MongoDB Atlas e o ms-pedidos usa Azure SQL." |
| PDF — C4 Containers | Apontar as linhas tracejadas | "As linhas tracejadas são a parte orientada a eventos: o ms-pedidos publica numa fila, a Function consome e atualiza o estoque. O Erick vai mostrar isso funcionando." |
| Frontend — barra de endereço | Mostrar a URL pública | "Tudo o que vamos mostrar está na nuvem. Este é o front, um microfrontend em React: o shell carrega em tempo de execução dois módulos remotos, Produtos e Pedidos." |
| Frontend — painel | Mostrar os cartões e o bloco "Fontes de dados" | "Esta tela faz **uma única chamada**, o `GET /aggregated-data`. Aqui embaixo aparece de onde veio cada parte: ms-produtos, ms-pedidos e Azure Function, com o tempo de cada um." |
| DevTools → Network | Clicar na requisição `aggregated-data` → *Headers* | "A chamada vai para o domínio do API Management, não para o BFF. Na resposta vêm o `x-gateway`, que o gateway coloca, o `x-served-by: pjbl-bff` e o `x-correlation-id`, que acompanha a requisição por todos os serviços." |
| DevTools → Network → *Timing* | Mostrar o *Server Timing* | "E o BFF devolve o tempo gasto em cada serviço no cabeçalho `Server-Timing`." |
| Frontend — painel "Chamadas ao BFF" | Abrir o painel | "O próprio front mostra essas informações para cada chamada." |

**Passagem:** "Agora o **Arthur** mostra o CRUD e as regras de negócio."

## Bloco 2 — CRUD e regras de negócio (Arthur)

**Fala de abertura:** "Eu sou **Arthur** e vou mostrar o CRUD de produtos, que fica no MongoDB, e o de pedidos, que fica no Azure SQL."

| Tela | O que fazer | O que dizer |
|---|---|---|
| Front → Produtos | Criar o produto `DEMO-VIDEO`, preço 19,90, estoque 10 | "Cadastro de produto. O estoque inicial vira uma movimentação de entrada." |
| Front → Produtos | Tentar criar outro com o mesmo SKU | "SKU é único: o microserviço responde 409 e o front mostra a mensagem." |
| Front → Produtos | Editar o preço; abrir o detalhe e lançar uma ENTRADA de 5 | "O estoque não é editável direto. Ele só muda por movimentação, e fica o histórico com o saldo." |
| MongoDB Atlas | Atualizar a coleção `products` e achar o `DEMO-VIDEO`; abrir `stock_movements` | "Aqui está o documento no Atlas, e as movimentações na outra coleção." |
| Front → Pedidos → Novo | Montar um pedido com 2 unidades do `DEMO-VIDEO` e criar | "No pedido eu escolho só o produto e a quantidade. O BFF busca o nome e o preço oficiais no ms-produtos antes de criar no ms-pedidos — não dá para mandar um preço diferente pelo navegador." |
| Front → Pedidos → Novo | Tentar um pedido com quantidade maior que o estoque | "Regra de negócio: estoque insuficiente. O BFF responde 409 dizendo quanto foi pedido e quanto tem." |
| Front → Pedidos | Abrir o pedido criado: mudar para PAGO; mostrar que os botões seguem a máquina de estados | "O pedido tem uma máquina de estados: pendente, pago, enviado, entregue, ou cancelado. O front só oferece as transições que o serviço permite." |
| Front → Pedidos | Tentar excluir um pedido que não está cancelado (ou mostrar o botão indisponível) / editar um pedido PAGO | "Só dá para editar pedido pendente e só dá para excluir pedido cancelado." |
| Portal Azure → Query editor | `SELECT TOP 5 Id, CustomerName, Status, Total FROM dbo.Orders ORDER BY CreatedAt DESC;` | "E aqui está o pedido no Azure SQL." |

**Passagem:** "O **Erick** vai mostrar o que aconteceu com o estoque depois desse pedido."

## Bloco 3 — Eventos e agregação (Erick)

**Fala de abertura:** "Eu sou **Erick**. Quando o pedido foi criado, ninguém chamou o ms-produtos para baixar o estoque. Isso é feito por evento."

| Tela | O que fazer | O que dizer |
|---|---|---|
| Portal Azure → Query editor | `SELECT TOP 5 Type, AggregateId, OccurredAt, ProcessedAt FROM dbo.OutboxMessages ORDER BY OccurredAt DESC;` | "O ms-pedidos grava o pedido e o evento `order.created` na mesma transação, nesta tabela de outbox. Assim nunca existe pedido sem evento. Um relay publica o evento na fila e preenche o `ProcessedAt`." |
| Front → Pedidos → Eventos | Mostrar o evento como PUBLICADO | "O front mostra a mesma coisa: evento publicado." |
| AsyncAPI (`/events/docs`) | Rolar pelos dois eventos | "O contrato dos eventos está documentado em AsyncAPI — é o nosso Swagger de eventos." |
| Portal Azure → Function → `processOrderEvent` | Mostrar a execução mais recente e o log | "A Azure Function tem um Queue Trigger nessa fila. Ela recebeu o evento e registrou uma saída de estoque para cada item, chamando o ms-produtos." |
| Front → Produtos → `DEMO-VIDEO` | Mostrar o estoque menor e a movimentação SAÍDA com "Pedido … criado" | "O estoque baixou sozinho, e a movimentação ficou no histórico com o id do evento. Se a fila entregar a mesma mensagem duas vezes, o ms-produtos reconhece esse id e não baixa de novo." |
| Front → Pedidos | Cancelar o pedido | "Agora eu cancelo o pedido. Sai um evento `order.cancelled`…" |
| Front → Produtos → `DEMO-VIDEO` | Esperar alguns segundos e mostrar a ENTRADA de devolução | "…e a Function devolve os itens ao estoque." |
| Front → Painel | Mostrar os indicadores atualizados e os eventos recentes | "No painel, os indicadores — faturamento, ticket médio, produtos com estoque baixo, alertas — são calculados pela Azure Function, no HTTP Trigger. O BFF manda os produtos e os pedidos e ela devolve os números." |
| Swagger do BFF | Executar `GET /aggregated-data` (servidor "Pelo API Gateway", autorizado) e mostrar o JSON | "Este é o JSON único que o enunciado pede: produtos, pedidos, eventos, indicadores e a situação de cada fonte." |

**Passagem:** "Para fechar, o **Luan** mostra a documentação, o gateway e os testes."

## Bloco 4 — Swagger, gateway, Docker, CI e testes (Luan)

**Fala de abertura:** "Eu sou **Luan** e vou mostrar a documentação das APIs, o API Gateway e como garantimos a arquitetura no código."

| Tela | O que fazer | O que dizer |
|---|---|---|
| Swagger ms-produtos, ms-pedidos, Function | Passar rápido pelas três abas | "Cada serviço tem o seu Swagger publicado: ms-produtos, ms-pedidos e a Function." |
| Portal Azure → API Management → policy | Mostrar a policy | "O gateway é o Azure API Management. A policy exige a chave de assinatura, limita a 120 chamadas por minuto, trata o CORS e injeta um segredo que só o gateway conhece." |
| Terminal ou nova aba | Abrir `https://apim-pjbl-0a42b2.azure-api.net/conecta/aggregated-data` sem chave → 401 | "Sem a chave, o gateway barra." |
| Nova aba | Abrir `https://bff.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/aggregated-data` direto → 401 | "E quem tenta pular o gateway e chamar o BFF direto também recebe 401, porque falta o segredo." |
| Docker Hub | Mostrar as três imagens com a tag `v1` | "As imagens do BFF e dos dois microserviços estão no Docker Hub…" |
| GitHub → Actions | Abrir uma execução verde, mostrar os jobs de teste e de imagem | "…e são publicadas pelo GitHub Actions, depois que os testes passam." |
| GitHub → `pjbl-ms-pedidos/src` | Abrir as pastas `domain`, `application/features`, `infrastructure`, `api` | "Todos os serviços têm as quatro camadas da Clean Architecture, e dentro de `features` uma pasta por caso de uso — `CreateOrder`, `GetOrder` — que é o Vertical Slice." |
| Terminal — `pjbl-bff` | `npm run test:arch` (tudo verde) | "Essas regras são verificadas por testes de arquitetura." |
| Editor + terminal | Colar `import express from 'express';` em `src/domain/orderDraft.ts`, rodar `npm run test:arch` de novo e mostrar a falha; desfazer | "Se eu importar o Express dentro do domínio, o teste falha e diz exatamente qual arquivo quebrou a regra. A esteira não deixaria isso passar." |
| GitHub → perfil | Mostrar os seis repositórios públicos | "São seis repositórios públicos, cada um com README, e este de arquitetura tem o ARC42, o C4 e o Canvas." |

**Fechamento (todos, se possível com a câmera):** "Esse foi o Conecta Store. Obrigado!" — cada um repete o nome.

---

## Publicação no YouTube

1. https://studio.youtube.com → **Criar** → **Enviar vídeos**.
2. Título sugerido: `PJBL Arquitetura Completa — Conecta Store`.
3. Na descrição, colar os nomes dos integrantes e o link do repositório `pjbl-arquitetura`.
4. Em **Público**, escolher "Não, não é conteúdo para crianças".
5. Em **Visibilidade**, marcar **Não listado** (só quem tem o link assiste).
6. Copiar o link, colocar em `URL_VIDEO` no `links.json` e rodar:
   ```bash
   node scripts/preencher-links.mjs
   node scripts/gerar-pdf.mjs
   ```
   para o link entrar nos READMEs e no PDF. Depois, commit e push.

## Se algo der errado durante a gravação

- **Painel com uma fonte em vermelho ou "serviço iniciando":** é o banco gratuito ou um container acordando. Espere uns 30 segundos e atualize. (Vale até comentar: "o sistema continua respondendo com o que está disponível".)
- **Estoque não baixou:** veja em Pedidos → Eventos se o evento está PUBLICADO; se estiver PENDENTE, espere alguns segundos.
- **401 no front:** a subscription key do build está errada; confira o secret `VITE_API_KEY` no repositório do front e rode o deploy de novo.
