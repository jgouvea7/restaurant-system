# Fase 4 - Endurecimento para produção

## Contexto

A Fase 3 deixou o fluxo de autenticação, pedidos e entregadores funcional, mas ainda com lacunas importantes para operação: eventos podiam ser perdidos, consumidores podiam processar a mesma mensagem duas vezes, a atribuição de entregador tinha corrida, o schema era criado por `synchronize`, não havia health check dedicado nem observabilidade básica.

A Fase 4 fecha essas lacunas com outbox persistente, idempotência de consumidores, reserva explícita de entregador, health checks, request id, rate limit e migrações versionadas. A Fase 4.1 complementa o trabalho com controllers mais finos e uma checagem de ownership centralizada no `restaurant`.

## Alterações

### Outbox e idempotência

- `aws/events/event.types.ts` define `EventOutboxStore`, `EventIdempotencyStore`, `StoredEvent` e os tokens de injeção.
- `EventPublisherService.publish()` grava no outbox quando o store está disponível; sem outbox, mantém o envio direto ao SNS.
- `EventPublisherService.deliver()` publica um evento já persistido.
- `OutboxRelayService` reivindica eventos pendentes, publica no SNS e marca como `published`; falhas voltam para `pending` com backoff exponencial.
- Eventos presos em `processing` por mais de 120 segundos são recuperados para `pending`, cobrindo queda do processo entre a reivindicação e a publicação.
- `EventConsumerService` registra `processed_events` por `(consumer, eventId)`, com estados `processing` e `processed`, lock de 60 segundos e liberação em caso de falha.
- `restaurant`, `payment` e `user` têm `outbox_events` e `processed_events` próprios, preservando `database per service`.
- No `restaurant`, criação de restaurante, criação de pedido, mudança de status e atribuição de entregador gravam estado e eventos na mesma transação.
- No `payment` e no `user`, os eventos são duráveis no outbox, mas a gravação do evento ainda não é atômica com a transação de domínio.

### Reserva de entregador

- `Courier` ganhou `reservedForOrderId` e `reservedAt`.
- `POST /courier/:id/reserve`, restrito a `owner`, reserva o entregador com um `UPDATE` condicional. Reservas repetidas para o mesmo pedido são idempotentes.
- `POST /courier/:id/release` libera a reserva quando o pedido é concluído ou cancelado.
- O `restaurant` encaminha o `Authorization` do usuário que iniciou a operação para o `user`; sem token, a atribuição falha com `503`.
- A atribuição agora roda em transação no `restaurant`: grava `courierId`, `courierAssignedAt`, status `out_for_delivery` e os eventos `order.status.changed` e `order.courier.assigned`.
- Se a transação falhar, o `restaurant` tenta liberar a reserva para não deixar o entregador bloqueado.
- `delivered` e `cancelled` liberam a reserva quando o pedido estava em `out_for_delivery`.

### Health, observabilidade e rate limit

- Cada serviço expõe `GET /health` com status `ok` ou `degraded`.
- `restaurant` e `user` verificam PostgreSQL e Redis; `payment` e `auth` verificam apenas PostgreSQL.
- O health check retorna `503` quando alguma dependência falha.
- O ALB do Terraform passou a usar `/health` em vez de `/`.
- `RequestContextMiddleware` adiciona/ecoa `x-request-id` e gera log JSON com método, caminho, status e duração.
- `RateLimitGuard` aplica limite em memória por IP, com `RATE_LIMIT_MAX_REQUESTS` (padrão `240`) e `RATE_LIMIT_WINDOW_MS` (padrão `60000`), ignorando `/health`.

### Migrações

- Os quatro serviços têm migração inicial versionada em `src/migrations/1700000001000-InitialSchema.ts`.
- As migrações são idempotentes (`IF NOT EXISTS`/`EXCEPTION WHEN duplicate_object`) para conviver com bancos criados anteriormente por `synchronize`.
- `synchronize` agora só é habilitado com `DB_SYNCHRONIZE=true`.
- `migrationsRun` é habilitado por padrão e pode ser desligado com `DB_MIGRATIONS_RUN=false`.
- O `restaurant` migra restaurantes, endereços, produtos, pedidos, itens, outbox e eventos processados.
- O `user` migra usuários, owners, costumers, couriers, endereços, outbox e eventos processados, incluindo as colunas de reserva.
- O `payment` migra pagamentos, outbox e eventos processados.
- O `auth` migra sessões de refresh.
- Foram adicionados índices para a fila do outbox (`status`, `nextAttemptAt` e `status`, `updatedAt`).

### Fase 4.1 - Controllers finos e ownership

- `RestaurantAccessService` centraliza `findByOwnerOrFail`, `isOwnedBy` e `listIdsByOwner`.
- Controllers deixaram de receber `ownerUserId`/`costumerUserId` do corpo para operações protegidas; o vínculo é derivado do token.
- `CreateRestaurantDto` e `CreateOrderDto` não aceitam mais ids de owner/cliente.
- `ProductsService` mantém métodos de domínio e ganhou variantes `createForOwner`, `updateForOwner` e `removeForOwner`.
- `RestaurantsService` e `OrdersService` usam o ownership centralizado em vez de repetir consultas.
- O `user` valida o próprio entregador nas rotas de localização/disponibilidade e, na liberação, exige que um courier seja o dono do id. Owner e cliente ainda não têm o vínculo com o pedido validado dentro do `user`.

### Infraestrutura

- `infra/main.tf`: health check dos quatro target groups aponta para `/health`.
- As variáveis de outbox podem ser ajustadas por `OUTBOX_RELAY_ENABLED`, `OUTBOX_RELAY_INTERVAL_MS` e `OUTBOX_BATCH_SIZE`.
- Não foram adicionados novos recursos de infraestrutura além do ajuste de health check.

## Como funciona

### Publicação de eventos

1. O serviço grava o estado de domínio e, quando aplicável, o evento em `outbox_events` na mesma transação.
2. `OutboxRelayService` busca eventos `pending` cujo `nextAttemptAt` já venceu.
3. Cada evento é marcado como `processing` antes do envio.
4. Após o SNS aceitar, o evento vira `published`.
5. Em caso de falha, volta para `pending`, incrementa `attempts` e agenda nova tentativa.
6. Eventos em `processing` há mais de 120 segundos são considerados órfãos e voltam para `pending`.

### Consumo idempotente

1. O consumer lê a mensagem da SQS.
2. Tenta adquirir `(consumer, eventId)` em `processed_events`.
3. Se já estiver `processed`, apaga a mensagem sem executar o handler.
4. Se estiver travado por outro consumidor, deixa a mensagem para redelivery.
5. Se adquirir, executa o handler e marca como `processed`.
6. Se o handler falhar, remove o registro de processamento e deixa a mensagem para redelivery.

### Atribuição de entregador

1. O owner chama `PATCH /orders/:id/courier`.
2. O `restaurant` valida o ownership e escolhe/valida o entregador.
3. O `restaurant` chama `POST /courier/:id/reserve` no `user`, reutilizando o token do owner.
4. O `user` faz um `UPDATE` condicional para reservar o entregador.
5. O `restaurant` grava pedido e eventos em uma transação.
6. Em `delivered` ou `cancelled`, o `restaurant` chama `POST /courier/:id/release`.
7. O `user` marca o entregador como disponível novamente e o recoloca no Redis.

### Health check

1. O ALB chama `GET /health`.
2. O serviço consulta o PostgreSQL e, quando aplicável, o Redis.
3. Tudo respondendo: `200` com `status: ok`.
4. Qualquer dependência falhando: `503` com `status: degraded`.

## Decisões e tradeoffs

### Outbox por serviço

Cada serviço mantém seu próprio outbox, preservando isolamento de banco e evitando uma tabela compartilhada entre domínios.

Tradeoff: o relay roda em cada réplica e o processamento é concorrente. A reivindicação por `UPDATE` condicional evita publicação duplicada na maioria dos casos, mas a entrega continua sendo pelo menos uma vez.

### Publicação transacional apenas onde há transação de domínio

O `restaurant` usa a transação do TypeORM para estado e eventos nos fluxos principais. `payment` e `user` ainda não envolvem a gravação do evento na mesma transação do estado.

Tradeoff: nesses dois serviços, uma falha entre o commit do estado e a gravação no outbox ainda pode perder o evento. O próximo passo é mover esses fluxos para transações explícitas.

### Idempotência no banco do consumidor

O controle fica no banco de cada consumidor, não em uma tabela global. Isso mantém o padrão `database per service` e permite locks independentes.

Tradeoff: a mesma mensagem pode ser processada por consumidores diferentes, o que é desejado, mas a tabela cresce indefinidamente enquanto não houver limpeza/particionamento.

### Reserva explícita com token encaminhado

O `restaurant` não tem credencial de serviço própria; ele reutiliza o token do usuário que iniciou a ação. Isso evita criar um novo modelo de autenticação nesta fase.

Tradeoff: o token do usuário circula em uma chamada interna e a operação depende da validade dele. Autenticação serviço a serviço continua pendente.

### Rate limit em memória

O limitador é simples e não exige Redis.

Tradeoff: cada réplica tem seu próprio contador. O limite efetivo é aproximadamente `RATE_LIMIT_MAX_REQUESTS * número de réplicas`, além de ser perdido em restart. Para produção, o próximo passo é um store distribuído.

### Migrações idempotentes

As migrações usam `IF NOT EXISTS` e capturam tipos duplicados para não quebrar bancos locais já criados por `synchronize`.

Tradeoff: a migração inicial não corrige divergências finas de schema em bancos antigos. Em um ambiente real, o caminho seria uma migração de baseline separada e testes contra um banco limpo.

## Validação

- `aws`: build aprovado.
- `libs`: build aprovado.
- `auth`: build aprovado, 2 suítes e 5 testes.
- `user`: build aprovado, 11 suítes e 26 testes.
- `restaurant`: build aprovado, 13 suítes e 39 testes.
- `payment`: build aprovado, 2 suítes e 5 testes.
- `docker compose config --quiet`: configuração válida.
- `terraform fmt` e `terraform validate`: não executados porque o CLI do Terraform não está instalado no host e o daemon do Docker não está disponível.

Não foi possível subir Floci/PostgreSQL, aplicar as migrações nem validar o fluxo completo com ALB, SNS, SQS e reserva real. A validação de integração fica pendente.

## Riscos e rollback

Riscos:

- Chamadas internas ainda não têm autenticação serviço a serviço; o token do usuário é reutilizado.
- A liberação de reserva por owner/cliente é autenticada, mas o `user` não valida se aquele usuário realmente participa do pedido.
- Reservas não expiram automaticamente; um pedido abandonado pode manter o entregador bloqueado.
- O rate limit é local a cada réplica.
- Não há limpeza ou particionamento de `outbox_events` e `processed_events`.
- Mensagens inválidas na SQS não têm DLQ e podem ficar em redelivery.
- O outbox do `payment` e do `user` ainda não é atômico com o estado de domínio.
- As migrações não foram executadas contra um banco real nesta validação.
- `synchronize=true` continua disponível como escape para desenvolvimento e pode mascarar divergências de schema.

Rollback:

- Reverter o PR remove outbox/idempotência, health checks, rate limit, reserva e migrações.
- As migrações têm `down` que remove as tabelas e tipos criados; em ambiente com dados, isso apaga o schema e deve ser usado com cautela.
- Para voltar ao comportamento antigo de schema, definir `DB_SYNCHRONIZE=true` e `DB_MIGRATIONS_RUN=false` na versão anterior.
- A reserva de entregador pode ser removida sem impacto nos dados de pedidos; as colunas novas em `Courier` ficam ignoradas pela versão antiga.

## Dúvidas e próximo passo

Dúvidas:

- Adicionar autenticação serviço a serviço para reserva/liberação e consultas internas.
- Implementar aceite/recusa do entregador, expiração de reserva e reprocessamento de reservas órfãs.
- Adicionar DLQ e política de retry para mensagens inválidas.
- Criar rotina de limpeza/particionamento de outbox e eventos processados.
- Migrar o rate limit para Redis.
- Adicionar métricas e tracing além dos logs JSON e do request id.
- Testar migrações e fluxos completos com Floci, PostgreSQL, SNS e SQS.

Próximo passo sugerido:

- Fase 5: autenticação serviço a serviço, DLQ, expiração de reservas, limpeza de outbox e observabilidade distribuída.
