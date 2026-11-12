# API Gateway

O gateway é a **única porta de entrada** do Conecta Store. O microfrontend só conhece a URL dele; o BFF fica atrás
e recusa (401) qualquer chamada que não tenha passado por aqui.

```
Microfrontend ──► API Gateway ──► BFF ──► ms-produtos / ms-pedidos / Azure Function
                  │
                  ├─ roteamento: /conecta/* → BFF
                  ├─ segurança: subscription key obrigatória + rate limit
                  ├─ CORS para o domínio do front
                  └─ injeta x-gateway-secret (o BFF só aceita com ele)
```

## Por que Azure API Management e não AWS

O enunciado sugere o AWS Gateway como uma das opções ("Pode usar"). Escolhemos o **Azure API Management, camada
Consumption**, por três motivos práticos:

1. **Tudo na mesma nuvem.** BFF, microserviços, banco SQL, fila e Function já estão na Azure. Com o gateway lá também,
   usamos uma conta só (Azure for Students, sem cartão de crédito), um único script de deploy e um único lugar para olhar logs.
2. **Custo zero.** A camada Consumption não tem custo fixo e inclui 1 milhão de chamadas por mês.
3. **Importa o OpenAPI do BFF.** As rotas do gateway são criadas a partir do `/openapi.json` do BFF, então a
   documentação e o gateway nunca ficam diferentes.

Para não ficar só na justificativa, a pasta `aws/` tem a definição equivalente para o **AWS API Gateway**, pronta para importar.

## Azure API Management (`azure-apim/`)

| Arquivo | Para que serve |
|---|---|
| `policy.xml` | Policy aplicada na API: CORS, `rate-limit` (120 chamadas/min por chave), cabeçalho `x-gateway-secret`, remoção da subscription key antes de repassar |
| `configurar-apim.ps1` | Cria a instância, o Named Value secreto, importa a API, aplica a policy e cria a subscription do front |

O `infra/deploy-azure.ps1` já chama o `configurar-apim.ps1`. Para rodar só o gateway:

```powershell
./azure-apim/configurar-apim.ps1 -ResourceGroup rg-pjbl -ApimName apim-pjbl-xxxxxx -Location brazilsouth `
    -BffUrl {{URL_BFF}} -PublisherEmail seu-email@exemplo.com
```

O segredo do gateway é pedido de forma oculta e fica guardado como *Named Value* secreto do APIM — ele não aparece
no `policy.xml` (o `{{bff-gateway-secret}}` que está lá é a sintaxe do próprio APIM para ler o Named Value).

### Como conferir

```bash
# sem chave: o gateway barra com 401
curl -i {{URL_GATEWAY}}/aggregated-data

# com chave: 200, e a resposta vem com x-gateway: azure-api-management e x-served-by: pjbl-bff
curl -i -H "Ocp-Apim-Subscription-Key: <chave>" {{URL_GATEWAY}}/aggregated-data

# direto no BFF, pulando o gateway: 401 UNAUTHORIZED
curl -i {{URL_BFF}}/aggregated-data
```

Observações da camada Consumption: a policy `rate-limit` (por subscription) está disponível, mas a `rate-limit-by-key`
(por IP, por exemplo) não. E a primeira chamada depois de um tempo parado pode demorar alguns segundos (cold start).

## AWS API Gateway (`aws/openapi-aws.yaml`)

Definição OpenAPI com as extensões `x-amazon-apigateway-*`. Faz a mesma coisa que a policy da Azure: proxy `/{proxy+}`
para o BFF, API key obrigatória (`x-api-key`), cabeçalho estático `x-gateway-secret` e preflight de CORS.

```bash
# 1. troque BFF_URL e GATEWAY_SECRET numa CÓPIA do arquivo (não faça commit da cópia)
# 2. importe e publique
aws apigateway import-rest-api --body fileb://openapi-aws.local.yaml
aws apigateway create-deployment --rest-api-id <id> --stage-name prod

# 3. API key + usage plan com limite de requisições
aws apigateway create-api-key --name microfrontend --enabled
aws apigateway create-usage-plan --name conecta-store \
    --throttle burstLimit=20,rateLimit=10 --api-stages apiId=<id>,stage=prod
aws apigateway create-usage-plan-key --usage-plan-id <plano> --key-id <chave> --key-type API_KEY
```

No front, bastaria apontar `VITE_API_URL` para `https://<id>.execute-api.<região>.amazonaws.com/prod`. A diferença é o
nome do cabeçalho da chave (`x-api-key` na AWS, `Ocp-Apim-Subscription-Key` na Azure).

> Esta alternativa AWS está documentada e versionada, mas a que está publicada e aparece no vídeo é a da Azure.
