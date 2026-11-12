// Modelo C4 do Conecta Store em Structurizr DSL.
// Para visualizar: https://structurizr.com/dsl (cole o conteúdo) ou
//   docker run -it --rm -p 8080:8080 -v .:/usr/local/structurizr structurizr/lite
// Os SVGs desta pasta são gerados por scripts/gerar-diagramas.mjs; este arquivo é a mesma
// arquitetura descrita no formato padrão do C4, para quem preferir usar as ferramentas do Structurizr.

workspace "Conecta Store" "Gestão de produtos, estoque e pedidos — Projeto PJBL Arquitetura Completa" {

    model {
        operador = person "Operador da loja" "Cadastra produtos, controla o estoque e registra os pedidos dos clientes."
        equipe = person "Equipe do projeto" "Alunos que desenvolvem, publicam e monitoram a solução."

        atlas = softwareSystem "MongoDB Atlas" "Banco de documentos gerenciado (camada gratuita M0)." "Externo"
        github = softwareSystem "GitHub" "Repositórios públicos, GitHub Actions e GitHub Pages." "Externo"
        dockerhub = softwareSystem "Docker Hub" "Registro público das imagens." "Externo"

        conecta = softwareSystem "Conecta Store" "Gestão de produtos, estoque e pedidos." {

            mfe = container "Microfrontend" "Shell + remotes de Produtos e Pedidos. Só conhece a URL do gateway." "React, Vite, Module Federation (GitHub Pages)" "Navegador"

            gateway = container "API Gateway" "Entrada única: subscription key, rate limit, CORS e x-gateway-secret." "Azure API Management (Consumption)"

            bff = container "BFF" "Agrega dados, orquestra a criação de pedidos e faz proxy do CRUD. Não tem banco." "Node.js, Express (Azure Container Apps)" {
                bffApi = component "API" "Endpoints por feature, middlewares (correlationId, gatewaySecret, rate limit, errorHandler), OpenAPI." "Express"
                bffAggregated = component "GetAggregatedDataHandler" "Consulta os microserviços em paralelo, chama a Function e tolera falha parcial." "Application"
                bffPlaceOrder = component "PlaceOrderHandler" "Catálogo → confere estoque → cria o pedido com nome e preço oficiais." "Application"
                bffProxies = component "ProductsProxyHandler / OrdersProxyHandler" "Filtram parâmetros e repassam o CRUD." "Application"
                bffHealth = component "CheckHealthHandler" "Saúde de cada dependência." "Application"
                bffDomain = component "Domain" "orderDraft (regras de montagem do pedido), erros e modelos." "TypeScript puro"
                bffProdutosApi = component "ProdutosHttpApi" "Implementa a porta ProductsApi." "Infrastructure, fetch"
                bffPedidosApi = component "PedidosHttpApi" "Implementa a porta OrdersApi." "Infrastructure, fetch"
                bffFunctionApi = component "IndicatorsFunctionApi" "Implementa a porta IndicatorsApi." "Infrastructure, fetch"
            }

            produtos = container "ms-produtos" "Produtos e movimentações de estoque (idempotentes por eventId)." "Node.js, Express (Azure Container Apps)" {
                prodApi = component "API" "Endpoints por feature, apiKey, errorHandler, OpenAPI." "Express"
                prodHandlers = component "Handlers de produto" "CreateProduct, ListProducts, GetProduct, UpdateProduct, DeleteProduct." "Application"
                prodStock = component "RegisterStockMovementHandler / ListStockMovementsHandler" "Entrada e saída de estoque; 200 duplicate para eventId repetido." "Application"
                prodDomain = component "Domain" "Product, StockMovement, erros." "TypeScript puro"
                prodRepos = component "Repositórios MongoDB" "Índices únicos (SKU, eventId); baixa atômica com $inc condicional." "Infrastructure, driver mongodb"
            }

            pedidos = container "ms-pedidos" "Pedidos, máquina de estados e Transactional Outbox." "Node.js, Express (Azure Container Apps)" {
                pedApi = component "API" "Endpoints por feature, apiKey, errorHandler, OpenAPI e AsyncAPI." "Express"
                pedCreate = component "CreateOrderHandler" "Cria o pedido e grava order.created no outbox." "Application"
                pedStatus = component "ChangeOrderStatusHandler" "Transição com concorrência otimista; cancelar grava order.cancelled." "Application"
                pedOthers = component "Demais handlers" "ListOrders, GetOrder, UpdateOrder, DeleteOrder, ListOrderEvents, DispatchOrderEvents." "Application"
                pedDomain = component "Domain" "Order (agregado), eventos, erros." "TypeScript puro"
                pedRepo = component "Repositório SQL + migração" "Pedido e outbox na mesma transação." "Infrastructure, mssql"
                pedRelay = component "OutboxRelay" "Acionado por sinal; publica pendentes e marca como processado." "Infrastructure"
                pedPublisher = component "AzureQueueEventPublisher" "Mensagem JSON em Base64." "Infrastructure, @azure/storage-queue"
            }

            function = container "Azure Function" "HTTP Trigger: calcula indicadores. Queue Trigger: aplica eventos de pedido no estoque." "Node.js, Azure Functions (Flex Consumption)" {
                fnHttp = component "CalculateIndicatorsEndpoint" "HTTP Trigger POST /api/indicators." "API"
                fnQueue = component "ProcessOrderEventEndpoint" "Queue Trigger da fila order-events." "API"
                fnIndicators = component "CalculateIndicatorsHandler" "Valida a entrada e calcula os indicadores." "Application"
                fnEvents = component "ProcessOrderEventHandler" "Evento → movimentações; decide o que relança para retry." "Application"
                fnDomain = component "Domain" "indicators, orderEvent." "TypeScript puro"
                fnGateway = component "ProdutosHttpStockGateway" "Implementa a porta StockGateway." "Infrastructure, fetch"
            }

            fila = container "order-events" "Eventos order.created e order.cancelled." "Azure Storage Queue" "Fila"
            sql = container "Azure SQL Database" "Orders, OrderItems, OutboxMessages." "Azure SQL (oferta gratuita serverless)" "Banco"
        }

        // ---------- contexto
        operador -> conecta "Gerencia produtos e pedidos pelo navegador" "HTTPS"
        equipe -> conecta "Publica e acompanha"
        equipe -> github "git push"
        conecta -> atlas "Lê e grava produtos" "Driver MongoDB / TLS"
        github -> conecta "Entrega o front e dispara os deploys"
        github -> dockerhub "Publica as imagens (Actions)"
        conecta -> dockerhub "Baixa as imagens"

        // ---------- containers
        operador -> mfe "Usa" "HTTPS"
        mfe -> gateway "Chama a API" "JSON/HTTPS + subscription key"
        gateway -> bff "Repassa" "HTTPS + x-gateway-secret"
        bff -> produtos "Consulta e repassa CRUD" "REST + x-api-key"
        bff -> pedidos "Consulta e repassa CRUD" "REST + x-api-key"
        bff -> function "Calcula indicadores" "HTTP Trigger + x-functions-key"
        produtos -> atlas "Lê e grava" "Driver MongoDB"
        pedidos -> sql "Lê e grava (pedido + outbox na mesma transação)" "T-SQL"
        pedidos -> fila "Publica eventos" "Storage Queue SDK" "Assincrono"
        fila -> function "Dispara" "Queue Trigger" "Assincrono"
        function -> produtos "Registra movimentação de estoque" "REST + eventId" "Assincrono"

        // ---------- componentes: BFF
        gateway -> bffApi "Repassa as requisições"
        bffApi -> bffAggregated "GET /aggregated-data"
        bffApi -> bffPlaceOrder "POST /orders"
        bffApi -> bffProxies "CRUD"
        bffApi -> bffHealth "GET /health"
        bffPlaceOrder -> bffDomain "Usa"
        bffAggregated -> bffProdutosApi "ProductsApi"
        bffAggregated -> bffPedidosApi "OrdersApi"
        bffAggregated -> bffFunctionApi "IndicatorsApi"
        bffPlaceOrder -> bffProdutosApi "ProductsApi"
        bffPlaceOrder -> bffPedidosApi "OrdersApi"
        bffProxies -> bffProdutosApi "ProductsApi"
        bffProxies -> bffPedidosApi "OrdersApi"
        bffProdutosApi -> produtos "REST"
        bffPedidosApi -> pedidos "REST"
        bffFunctionApi -> function "HTTP"

        // ---------- componentes: ms-produtos
        bff -> prodApi "REST"
        function -> prodApi "POST stock-movements"
        prodApi -> prodHandlers "Chama"
        prodApi -> prodStock "Chama"
        prodHandlers -> prodDomain "Usa"
        prodStock -> prodDomain "Usa"
        prodHandlers -> prodRepos "ProductRepository"
        prodStock -> prodRepos "StockMovementRepository"
        prodRepos -> atlas "Driver MongoDB"

        // ---------- componentes: ms-pedidos
        bff -> pedApi "REST"
        pedApi -> pedCreate "Chama"
        pedApi -> pedStatus "Chama"
        pedApi -> pedOthers "Chama"
        pedCreate -> pedDomain "Usa"
        pedStatus -> pedDomain "Usa"
        pedCreate -> pedRepo "OrderRepository"
        pedStatus -> pedRepo "OrderRepository"
        pedOthers -> pedRepo "OrderRepository"
        pedCreate -> pedRelay "Avisa que há evento novo"
        pedStatus -> pedRelay "Avisa que há evento novo"
        pedRelay -> pedRepo "Lê o outbox"
        pedRelay -> pedPublisher "EventPublisher"
        pedRepo -> sql "T-SQL"
        pedPublisher -> fila "Publica"

        // ---------- componentes: Function
        bff -> fnHttp "POST /api/indicators"
        fila -> fnQueue "Queue Trigger"
        fnHttp -> fnIndicators "Chama"
        fnQueue -> fnEvents "Chama"
        fnIndicators -> fnDomain "Usa"
        fnEvents -> fnDomain "Usa"
        fnEvents -> fnGateway "StockGateway"
        fnGateway -> produtos "REST"
    }

    views {
        systemContext conecta "C4-1-Contexto" "Nível 1: quem usa o Conecta Store e de quais sistemas externos ele depende." {
            include *
            autoLayout tb
        }

        container conecta "C4-2-Containers" "Nível 2: as partes que compõem o Conecta Store." {
            include *
            autoLayout lr
        }

        component bff "C4-3-Componentes-BFF" "Nível 3: componentes do BFF." {
            include *
            autoLayout lr
        }

        component pedidos "C4-3-Componentes-ms-pedidos" "Nível 3: componentes do ms-pedidos." {
            include *
            autoLayout lr
        }

        component produtos "C4-3-Componentes-ms-produtos" "Nível 3: componentes do ms-produtos." {
            include *
            autoLayout lr
        }

        component function "C4-3-Componentes-Function" "Nível 3: componentes da Azure Function." {
            include *
            autoLayout lr
        }

        styles {
            element "Person" {
                shape Person
                background #0b3d6e
                color #ffffff
            }
            element "Software System" {
                background #1565b0
                color #ffffff
            }
            element "Container" {
                background #2f7fc8
                color #ffffff
            }
            element "Component" {
                background #a9d0f5
                color #12263a
            }
            element "Externo" {
                background #8c8c8c
                color #ffffff
            }
            element "Banco" {
                shape Cylinder
            }
            element "Fila" {
                shape Pipe
            }
            element "Navegador" {
                shape WebBrowser
            }
            relationship "Assincrono" {
                style dashed
            }
        }
    }
}
