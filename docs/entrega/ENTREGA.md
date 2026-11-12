# Entrega 3 — Projeto PJBL Arquitetura Completa

**Sistema:** Conecta Store — gestão de produtos, estoque e pedidos.

**Grupo:**

- Arthur Ambrozewicz Cidral
- Erick Marlon Barbieri da Silva
- Luan Alberti Estevinho
- Vinícius de Oliveira Garcia

## O que enviar

1. O arquivo **`Entrega3-ConectaStore.pdf`** (está nesta pasta). Ele contém o ARC42 com todos os links, o C4 Model
   (Contexto, Containers e Componentes), o Canvas e os prints.
2. O texto abaixo, colado no campo de comentário/descrição da entrega.

## Texto para colar na entrega

```
Projeto PJBL – Arquitetura Completa – Entrega 3
Sistema: Conecta Store (gestão de produtos, estoque e pedidos)

Grupo: Arthur Ambrozewicz Cidral, Erick Marlon Barbieri da Silva, Luan Alberti Estevinho e Vinícius de Oliveira Garcia

VÍDEO (YouTube, não listado)
{{URL_VIDEO}}

APLICAÇÃO NA NUVEM
Frontend (microfrontend): https://devinigarcia.github.io/pjbl-microfrontend
API Gateway (Azure API Management): https://apim-pjbl-0a42b2.azure-api.net/conecta

SWAGGER
BFF: https://bff.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/docs
Microserviço 1 – produtos (MongoDB Atlas): https://ms-produtos.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/docs
Microserviço 2 – pedidos (Azure SQL): https://ms-pedidos.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/docs
Eventos (AsyncAPI): https://ms-pedidos.agreeablesand-8dc3837e.brazilsouth.azurecontainerapps.io/events/docs
Azure Function: https://func-pjbl-0a42b2.azurewebsites.net/api/docs

GITHUB (repositórios públicos)
Microfrontend: https://github.com/devinigarcia/pjbl-microfrontend
BFF: https://github.com/devinigarcia/pjbl-bff
Microserviço Mongo: https://github.com/devinigarcia/pjbl-ms-produtos
Microserviço SQL: https://github.com/devinigarcia/pjbl-ms-pedidos
Azure Function: https://github.com/devinigarcia/pjbl-function
Arquitetura (ARC42, C4, Canvas, gateway, deploy): https://github.com/devinigarcia/pjbl-arquitetura

DOCKER HUB (tag v1)
https://hub.docker.com/r/vinigarciaa/pjbl-bff
https://hub.docker.com/r/vinigarciaa/pjbl-ms-produtos
https://hub.docker.com/r/vinigarciaa/pjbl-ms-pedidos

DOCUMENTAÇÃO
PDF da Entrega 3 (ARC42, C4, Canvas e prints): em anexo e em
https://github.com/devinigarcia/pjbl-arquitetura/blob/main/docs/entrega/Entrega3-ConectaStore.pdf
```

## Onde está cada item do enunciado

| Pedido no enunciado | Onde está |
|---|---|
| Microfrontend (SPA React) que consome só o BFF | [pjbl-microfrontend](https://github.com/devinigarcia/pjbl-microfrontend) · site no ar |
| BFF em Node.js com `GET /aggregated-data`, proxy de CRUD e chamada à Function | [pjbl-bff](https://github.com/devinigarcia/pjbl-bff) |
| Microserviço 1 com MongoDB Atlas, CRUD e Swagger | [pjbl-ms-produtos](https://github.com/devinigarcia/pjbl-ms-produtos) |
| Microserviço 2 com Azure SQL, CRUD e Swagger | [pjbl-ms-pedidos](https://github.com/devinigarcia/pjbl-ms-pedidos) |
| Azure Function com HTTP Trigger e Message Trigger | [pjbl-function](https://github.com/devinigarcia/pjbl-function) |
| API Gateway (roteamento, segurança, entrada central) | [pjbl-arquitetura/gateway](https://github.com/devinigarcia/pjbl-arquitetura/tree/main/gateway) · PDF, seções 8.3 e ADR-05 |
| Event-Driven Architecture | PDF, seções 6.2 e 8.2 · AsyncAPI no ar |
| Dockerização e Docker Hub | três imagens com tag `v1`, publicadas pelo GitHub Actions |
| Clean Architecture (Domain, Application, Infrastructure, API) | pasta `src/` de cada backend · PDF, seção 5.2 |
| Vertical Slice (`CreateOrder`, `GetOrder`...) | pastas `features/` · PDF, seção 5.2 |
| Testes unitários e de arquitetura | pasta `tests/` de cada projeto · PDF, seção 8.6 |
| README em cada projeto, com nomes dos alunos | raiz de cada repositório |
| ARC42 com os links | PDF, Parte I e página "Links da entrega" |
| C4 Model: Contexto, Containers, Componentes | PDF, Parte II |
| Canvas | PDF, Parte III |
| Prints: Swagger BFF, Swagger dos microserviços, Frontend, API Gateway | PDF, Parte IV |
| Vídeo no YouTube (não listado), com todos falando | {{URL_VIDEO}} · roteiro em [docs/roteiro-video.md](../roteiro-video.md) |

## Antes de enviar

- [ ] Gravar o vídeo seguindo o roteiro e publicar como **Não listado**.
- [ ] Colocar o link em `URL_VIDEO` no `links.json` e rodar `node scripts/preencher-links.mjs` e `node scripts/gerar-pdf.mjs`.
- [ ] Conferir que no PDF, na página "Links da entrega", o vídeo não aparece mais como pendente.
- [ ] Abrir o front e esperar o painel carregar com as três fontes em verde (a primeira chamada depois de um tempo parado demora).
