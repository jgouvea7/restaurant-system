# Sistema de Restaurante

Projeto de **treino de System Design e tecnologias**, criado para estudar na prática como aplicações reais são estruturadas: microsserviços, filas, cache, banco de dados, armazenamento de arquivos, load balancing e infraestrutura como código.

A AWS é simulada localmente com o [Floci](https://floci.io/), um emulador open source que expõe APIs compatíveis com AWS (EC2, RDS, ElastiCache, S3, SNS, SQS, ELBv2, Auto Scaling e outras). Assim é possível aprender Terraform e os serviços da AWS sem custo e sem depender da nuvem real.

> Este projeto tem fins **didáticos**. Credenciais, rede e configurações não são adequadas para produção.

## Objetivos

- Praticar arquitetura de microsserviços com NestJS e TypeScript.
- Aprender AWS usando o Floci como emulador local.
- Provisionar toda a infraestrutura com Terraform.
- Entender o caminho de uma requisição: cliente → load balancer → instâncias → banco/cache/fila.
- Simular padrões de aplicações de grande escala: réplicas, health checks, auto scaling, banco por serviço e eventos assíncronos.

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Aplicação | NestJS 11, TypeScript, TypeORM |
| Banco relacional | PostgreSQL 16 |
| Cache | Redis 7 (ElastiCache) com Redis GEO |
| Mensageria | SNS + SQS |
| Arquivos | S3 |
| Infraestrutura | Terraform (provider AWS 6.x) |
| AWS local | Floci 2.3.0 |
| Containers | Docker e Docker Compose |
| Testes | Jest |

## Arquitetura

O domínio é dividido em quatro microsserviços:

| Serviço | Responsabilidade | Status |
| --- | --- | --- |
| `user` | Usuários, clientes, entregadores e endereços | Implementado |
| `auth` | Autenticação e autorização | Estrutura inicial |
| `restaurant` | Restaurantes, cardápios e pedidos | Implementado |
| `payment` | Pagamentos simulados e publicação do resultado | Implementado |

Cada microsserviço tem seu próprio banco (`database per service`), sua própria imagem/AMI, seu próprio ALB e um Auto Scaling Group com 3 réplicas. Os serviços `user`, `restaurant` e `payment` já rodam nesse modelo; `auth` segue o mesmo padrão quando for implementado.

```mermaid
flowchart TB
    Client[Cliente]

    Client --> UserALB[ALB user :8080]
    Client --> RestaurantALB[ALB restaurant :8081]
    Client --> PaymentALB[ALB payment :8082]

    subgraph UserService[user]
        UserALB --> U1[user #1]
        UserALB --> U2[user #2]
        UserALB --> U3[user #3]
    end

    subgraph RestaurantService[restaurant]
        RestaurantALB --> R1[restaurant #1]
        RestaurantALB --> R2[restaurant #2]
        RestaurantALB --> R3[restaurant #3]
    end

    subgraph PaymentService[payment]
        PaymentALB --> P1[payment #1]
        PaymentALB --> P2[payment #2]
        PaymentALB --> P3[payment #3]
    end

    U1 --> UserDB[(PostgreSQL<br/>user-db)]
    U2 --> UserDB
    U3 --> UserDB

    R1 --> RestaurantDB[(PostgreSQL<br/>restaurant-db)]
    R2 --> RestaurantDB
    R3 --> RestaurantDB

    P1 --> PaymentDB[(PostgreSQL<br/>payment-db)]
    P2 --> PaymentDB
    P3 --> PaymentDB

    U1 --> Redis[(Redis cache)]
    U2 --> Redis
    U3 --> Redis

    R1 --> Redis
    R2 --> Redis
    R3 --> Redis

    U1 --> S3[(S3 uploads)]
    U2 --> S3
    U3 --> S3

    R1 --> S3
    R2 --> S3
    R3 --> S3

    U1 --> SNS[[SNS events]]
    R1 --> SNS
    P1 --> SNS
    SNS -. order.created .-> PaymentSQS[[SQS payment-events]]
    SNS -. payment.approved/rejected .-> RestaurantSQS[[SQS restaurant-events]]
```

O diagrama também está disponível em `docs/mermaid-diagram.png`.

### Infraestrutura provisionada

| Recurso | Configuração |
| --- | --- |
| VPC | `10.20.0.0/16` |
| Subnets | `10.20.1.0/24` (us-east-1a) e `10.20.2.0/24` (us-east-1b) |
| ALB | `user` em `localhost:8080`, `restaurant` em `localhost:8081` e `payment` em `localhost:8082` |
| Auto Scaling | `user`, `restaurant` e `payment` com `min=1`, `desired=3`, `max=5` |
| RDS | PostgreSQL `user-db` na porta `17001`, `restaurant-db` na porta `17002` e `payment-db` na porta `17003` |
| ElastiCache | Redis `cache` na porta `16379` |
| S3 | Bucket `uploads` |
| SNS | Tópico `events` |
| SQS | Filas `restaurant-events` e `payment-events` com filtros por `eventType` |

### Portas locais

| Porta | Serviço |
| --- | --- |
| `4566` | API do Floci |
| `8080` | ALB do microsserviço `user` |
| `8081` | ALB do microsserviço `restaurant` |
| `8082` | ALB do microsserviço `payment` |
| `17001-17099` | Proxies de PostgreSQL (RDS) |
| `16379-16399` | Proxies de Redis (ElastiCache) |
| `2200-2299` | SSH das instâncias EC2 emuladas |
| `3000` | Porta interna das aplicações dentro das instâncias |

As aplicações escutam em `3000` dentro das instâncias. O acesso externo passa exclusivamente pelo ALB, então a porta `3000` não é publicada no host.

## Estrutura do projeto

```text
.
├── auth/                  # Microsserviço de autenticação (estrutura inicial)
├── aws/                   # Pacote compartilhado de integração com AWS
├── docs/                  # Diagramas
├── infra/                 # Terraform
│   ├── floci/             # Catálogo de AMIs do Floci
│   ├── main.tf            # VPC, subnets, RDS, Redis, S3, SNS, SQS, ALB, ASG
│   ├── outputs.tf
│   ├── provider.tf
│   └── variables.tf
├── payment/               # Microsserviço de pagamentos
├── restaurant/            # Microsserviço de restaurante
├── user/                  # Microsserviço de usuários
├── docker-compose.yml
└── README.md
```

O pacote `aws/` centraliza a integração com S3, SNS, SQS, EC2 e ElastiCache (Redis) para ser reutilizado pelos serviços.

### Redis GEO

Os restaurantes são indexados no Redis GEO sob a chave `restaurants:geo` sempre que são criados com latitude/longitude. A busca por restaurantes próximos usa o comando `GEOSEARCH` do Redis 7 e devolve os resultados ordenados pela distância:

```bash
curl "http://localhost:8081/restaurants/nearby?latitude=-23.5614&longitude=-46.6559&radiusKm=5&limit=10"
```

A conexão é configurada por `REDIS_HOST` e `REDIS_PORT` (padrão `localhost:16379`). O `ElastiCacheService`, em `aws/elastic-cache/`, expõe `addLocation`, `addLocations`, `findNearby`, `getPosition`, `removeLocation` e operações de conjunto (`addToSet`, `removeFromSet`, `getSetMembers`) para reutilização em outros serviços.

### Entregadores

A localização dos entregadores fica em `couriers:geo` e a disponibilidade em `couriers:available`. A busca de entregadores próximos cruza os dois conjuntos e retorna apenas quem está disponível:

```bash
# Atualizar a localização
curl -X PATCH http://localhost:8080/courier/COURIER_ID/location \
  -H "Content-Type: application/json" \
  -d '{"latitude":-23.5614,"longitude":-46.6559}'

# Definir disponibilidade
curl -X PATCH http://localhost:8080/courier/COURIER_ID/availability \
  -H "Content-Type: application/json" \
  -d '{"available":true}'

# Buscar entregadores disponíveis próximos
curl "http://localhost:8080/courier/nearby?latitude=-23.5614&longitude=-46.6559&radiusKm=5&limit=10"
```

O endpoint antigo `POST /courier/:id/available` continua disponível e alterna o estado atual.

### Pedidos e pagamentos

O `restaurant` expõe CRUD de produtos e pedidos. Ao criar um pedido, os itens guardam um snapshot de nome e preço do produto, e o pedido nasce como `pending_payment`:

```bash
curl -X POST http://localhost:8081/orders \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "RESTAURANT_ID",
    "costumerUserId": "CUSTOMER_ID",
    "paymentMethod": "pix",
    "deliveryAddress": "Rua Exemplo, 123",
    "items": [{ "productId": "PRODUCT_ID", "quantity": 2 }]
  }'

curl "http://localhost:8081/orders?restaurantId=RESTAURANT_ID"
curl -X PATCH http://localhost:8081/orders/ORDER_ID/status \
  -H "Content-Type: application/json" \
  -d '{"status":"preparing"}'
```

O `payment` consome `order.created` e aprova automaticamente pedidos até `PAYMENT_APPROVAL_LIMIT` (padrão `1000`). O resultado é publicado como `payment.approved` ou `payment.rejected`; o `restaurant` consome esses eventos e atualiza o pedido para `confirmed` ou `payment_rejected`. O pagamento pode ser consultado por:

```bash
curl http://localhost:8082/payments/ORDER_ID
```

Transições manuais permitidas: `pending_payment` → `cancelled`; `confirmed` → `preparing` → `ready` → `out_for_delivery` → `delivered`; `confirmed`, `preparing`, `ready` e `out_for_delivery` também podem ir para `cancelled`. `delivered`, `cancelled` e `payment_rejected` são estados finais.

O processamento é pelo menos uma vez, então `PaymentsService` ignora pedidos que já possuem pagamento e `OrdersService` ignora eventos de pagamento para pedidos que não estão mais em `pending_payment`.

### Eventos

O pacote `aws/events/` define o envelope `DomainEvent`, os tipos de evento e os serviços `EventPublisherService` (SNS) e `EventConsumerService` (SQS). O `EventConsumerService` usa long polling com `start()`/`stop()` e é iniciado no `onApplicationBootstrap` de cada consumer.

O Terraform provisiona duas filas com filtros por `eventType`:

| Fila | Eventos | Consumidor |
| --- | --- | --- |
| `payment-events` | `order.created` | `payment` |
| `restaurant-events` | `payment.approved`, `payment.rejected` | `restaurant` |

Eventos publicados nesta fase:

| Evento | Origem |
| --- | --- |
| `restaurant.created` | `restaurant` |
| `restaurant.deleted` | `restaurant` |
| `courier.location.updated` | `user` |
| `courier.availability.changed` | `user` |
| `order.created` | `restaurant` |
| `order.status.changed` | `restaurant` |
| `payment.approved` | `payment` |
| `payment.rejected` | `payment` |

As variáveis `SNS_TOPIC_ARN` e `SQS_QUEUE_URL` configuram os clientes. O `restaurant` consulta o serviço de usuários por `USER_SERVICE_URL` (padrão `http://floci:8080`).

## Como executar

### Pré-requisitos

- Docker Desktop com Docker Compose
- Node.js 22 (apenas para desenvolvimento local dos serviços)
- Terraform não precisa estar instalado no host: os comandos rodam no container `hashicorp/terraform`.

### Subir tudo

```bash
docker compose up -d --build
```

Esse comando:

1. Sobe o Floci.
2. Constrói as imagens `user-app:latest`, `restaurant-app:latest` e `payment-app:latest`.
3. Executa `terraform init` e `terraform apply` dentro do container.

Acompanhe a infraestrutura:

```bash
docker compose logs -f terraform
```

Quando o apply terminar:

```bash
curl http://localhost:8080
curl http://localhost:8081
curl http://localhost:8082
# Hello World!
```

### Verificar as réplicas e a saúde dos targets

```bash
# Credenciais fictícias usadas pelo Floci
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# No PowerShell: $env:AWS_ACCESS_KEY_ID="test"; $env:AWS_SECRET_ACCESS_KEY="test"; $env:AWS_DEFAULT_REGION="us-east-1"

aws --endpoint-url http://localhost:4566 autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names user restaurant payment

TG_ARN=$(aws --endpoint-url http://localhost:4566 elbv2 describe-target-groups \
  --names user \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

aws --endpoint-url http://localhost:4566 elbv2 describe-target-health \
  --target-group-arn "$TG_ARN"

# Repita trocando "user" por "restaurant" ou "payment" para checar os outros serviços.
```

### Reaplicar mudanças de infraestrutura

O serviço `terraform` do Compose é de execução única. Depois de alterar arquivos em `infra/`, rode:

```bash
docker compose run --rm terraform
```

### Desenvolvimento local dos serviços

Com o Floci e os bancos no ar:

```bash
cd user
npm install
npm test
npm run start:dev

cd ../restaurant
npm install
npm test
npm run start:dev

cd ../payment
npm install
npm test
npm run start:dev
```

### Testes e validações

```bash
cd user && npm test
cd ../restaurant && npm test
cd ../payment && npm test
cd ../aws && npm run build
docker compose run --rm terraform sh -c "terraform fmt -check -recursive && terraform validate"
docker compose config --quiet
```

### CI/CD e auto-merge

Pull requests abertos pela conta `jgouvea7`, do próprio repositório e fora de draft entram no fluxo automático:

1. O workflow `CI` roda `node`, `terraform` e `compose`.
2. Se todos passarem, o job `Auto merge` faz o merge com commit de merge e apaga a branch remota. PRs de outras contas não são mergeados automaticamente.
3. O workflow `Cleanup merged branches` roda semanalmente e também pode ser disparado manualmente para apagar branches `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*` e `test/*` já mescladas em `main`.

O auto-merge usa o `GITHUB_TOKEN`, então o repositório precisa permitir escrita do workflow. Proteções de branch que exigem revisão humana ou checks externos podem impedir o merge automático. O repositório também está configurado com `delete_branch_on_merge`, então merges manuais apagam a branch automaticamente.

### Derrubar o ambiente

```bash
docker compose down
```

O estado do Floci fica no volume `floci-data`. Para apagar também os dados:

```bash
docker compose down -v
```

## Como adicionar um novo microsserviço

O padrão usado por `user` e `restaurant` deve ser repetido para os próximos serviços:

1. **Crie a aplicação** (por exemplo, `payment/`) com NestJS e um `Dockerfile`.
   Use `ENTRYPOINT ["node", "dist/main.js"]`. O Floci preserva o `ENTRYPOINT` e substitui o `CMD` por `tail -f /dev/null`; por isso, um Dockerfile que só usa `CMD` não inicia a aplicação.
2. **Publique a imagem** adicionando um serviço de build no `docker-compose.yml`, por exemplo `payment-image`.
3. **Cadastre a AMI** em `infra/floci/ec2-image-catalog.yaml`, apontando `dockerImage` para a nova imagem.
4. **Crie a infraestrutura** em `infra/main.tf` seguindo o bloco do `user`:
   - `aws_launch_template` com a AMI do serviço;
   - `aws_lb_target_group` na porta `3000`;
   - `aws_lb` e `aws_lb_listener` em uma porta livre (`8081`, `8082`, ...);
   - `aws_autoscaling_group` com `desired_capacity = 3`.
5. **Crie o banco do serviço** com um `aws_db_instance` próprio (`payment-db`) e o respectivo `db_name`.
6. **Use o S3 compartilhado** com um prefixo do serviço, por exemplo `payment/`.
7. **Configure as variáveis de ambiente** `DB_HOST=floci`, `DB_PORT`, `DB_NAME`, `REDIS_HOST=floci`, `REDIS_PORT=16379`, `AWS_ENDPOINT_URL=http://floci:4566`, etc.
8. **Exponha a porta do novo ALB** no `docker-compose.yml` e adicione um output com a URL.

## Estratégia de S3

O projeto usa **um bucket compartilhado**, `uploads`, com prefixos por serviço:

```text
uploads/
├── user/
├── auth/
└── restaurant/
```

Essa abordagem é suficiente para simular grande escala: o S3 escala independentemente do volume e evita a proliferação de buckets. Buckets separados só se justificam quando há diferenças de ciclo de vida, criptografia, retenção, compliance ou proprietário.

## Limitações do Floci

O Floci é um emulador, não a AWS real. Alguns pontos importantes:

- **Auto Scaling não reage a métricas de CPU.** O grupo mantém o `desired_capacity` (3), mas políticas de target tracking são armazenadas e não avaliadas.
- **Load balancers usam um socket por porta.** Por isso cada serviço usa uma porta de listener diferente (`8080`, `8081`, ...).
- **ALB exige duas subnets em AZs diferentes**, o que motivou a criação da subnet `10.20.2.0/24`.
- **O `CMD` do Dockerfile é substituído**, então use `ENTRYPOINT` para iniciar a aplicação.
- **Security groups não são aplicados como firewall** por padrão; as portas das instâncias também não são publicadas no host quando `FLOCI_SERVICES_EC2_PUBLISH_SECURITY_GROUP_PORTS=false`.
- O estado é persistido no volume `floci-data` e sobrevive a reinícios do container.

## Próximos passos

- Implementar `auth` com seu próprio banco e ALB.
- Adicionar outbox e idempotência persistente para eventos críticos.
- Adicionar health checks específicos (`/health`) e observabilidade.