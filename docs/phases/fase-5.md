# Fase 5: autenticação serviço a serviço, resiliência e observabilidade

Esta fase fecha as dívidas apontadas na Fase 4: chamadas internas autenticadas, reservas de entregador com aceite/recusa/expiração, DLQ no SQS, limpeza de outbox/eventos processados, rate limit distribuído e métricas/tracing básicos.

## Autenticação serviço a serviço

As chamadas internas usam HMAC-SHA256 com os headers:

- `x-service-name`: serviço de origem (`auth`, `restaurant`, `payment`, `user`);
- `x-service-timestamp`: timestamp em milissegundos;
- `x-service-signature`: HMAC de `serviceName\n timestamp` com `SERVICE_AUTH_SECRET`.

O `ServiceAuthGuard` valida presença, assinatura e janela de 60 segundos. `POST /users/authenticate` e os endpoints de reserva/liberação do `user` não aceitam mais JWT de usuário; apenas chamadas de serviço assinadas.

Tradeoff: o segredo é compartilhado entre os serviços via ambiente. Em produção, o ideal é um provedor de identidade de workload (por exemplo, IAM Roles Anywhere ou SPIFFE) com rotação de credenciais.

## Reserva de entregador

A reserva agora tem estados `pending`, `accepted` e `rejected`:

1. `POST /courier/:id/reserve` grava `reservationStatus=pending`, `reservationExpiresAt` e publica `courier.assignment.offered`.
2. `POST /courier/:id/accept` confirma a reserva e publica `courier.assignment.accepted`.
3. `POST /courier/:id/reject` libera o entregador e publica `courier.assignment.rejected`.
4. Um sweeper no `user` libera reservas vencidas e publica `courier.assignment.expired`.
5. `restaurant` consome recusa/expiração e devolve o pedido de `out_for_delivery` para `ready`, limpando `courierId`, além de publicar `order.status.changed`.

O TTL é configurável por `COURIER_RESERVATION_TTL_SECONDS` (padrão `120`) e o sweeper por `COURIER_RESERVATION_SWEEP_INTERVAL_MS` (padrão `30000`). Para desativar o sweeper, use `COURIER_RESERVATION_SWEEP_ENABLED=false`.

Tradeoff: o aceite é um reconhecimento explícito, mas o pedido ainda entra em `out_for_delivery` na oferta. A recusa/expiração compensa o estado. Em uma próxima iteração, o pedido pode permanecer em `ready` até o aceite.

## DLQ e retry

O Terraform cria `restaurant-events-dlq` e `payment-events-dlq`, com `maxReceiveCount=5` e retenção de 14 dias. O filtro de `restaurant-events` inclui `courier.assignment.rejected` e `courier.assignment.expired`.

Tradeoff: as DLQs existem, mas não há ainda um consumidor de replay automático. O reprocessamento é manual (redrive no painel da AWS ou via CLI).

## Limpeza de outbox e eventos processados

O `aws` expõe `OutboxCleanupService`, que recebe um `EventMaintenanceStore`. Os stores TypeORM de `user`, `restaurant` e `payment` implementam `purgePublishedBefore` e `purgeProcessedBefore`. A rotina roda em background com:

- `OUTBOX_RETENTION_DAYS` e `PROCESSED_EVENTS_RETENTION_DAYS` (padrão `7`);
- `OUTBOX_CLEANUP_INTERVAL_MS` (padrão `3600000`);
- `OUTBOX_CLEANUP_ON_START=true` para executar no boot;
- `OUTBOX_CLEANUP_ENABLED=false` para desativar.

As migrações da fase adicionam índices em `(status, publishedAt)` e `(status, processedAt)` para manter a limpeza barata.

Tradeoff: exclusão física simples resolve o volume atual. Para tabelas muito grandes, o próximo passo é particionamento por data ou arquivamento em S3.

## Rate limit distribuído

O `RateLimitGuard` usa Redis com janela fixa por `service + clientId + windowStart`. Se o Redis não estiver configurado ou falhar, ele cai para o contador em memória e registra um aviso. `/health` e `/metrics` ficam fora do limite.

Tradeoff: janela fixa permite picos na virada da janela. Uma janela deslizante ou token bucket no Redis seria mais preciso.

## Métricas e tracing

Cada serviço registra `GET /metrics` com contadores por método/rota/status, histograma de duração, uptime do processo e uso de heap. O middleware de request cria `x-request-id` quando ausente, aceita `traceparent` e propaga ambos via `AsyncLocalStorage` para as chamadas internas com `internalRequestHeaders()`.

Tradeoff: as métricas são em memória por réplica e o tracing não exporta spans para um backend. A integração com OpenTelemetry/Jaeger fica para a próxima fase.

## Validação

- `libs` e `aws`: build aprovado.
- `auth`: build aprovado, 2 suítes e 5 testes.
- `user`: build aprovado, 12 suítes e 35 testes.
- `restaurant`: build aprovado, 13 suítes e 41 testes.
- `payment`: build aprovado, 2 suítes e 5 testes.
- `docker compose config --quiet`: configuração válida.
- `terraform fmt`, `terraform init -backend=false` e `terraform validate` (via container `hashicorp/terraform:1.9`): aprovados.
- Builds Docker de `auth` e `payment`: aprovados.

Não foi possível subir Floci/PostgreSQL/Redis, aplicar as migrações nem validar o fluxo completo com ALB, SNS, SQS e entregador real; o `docker compose run` falhou ao publicar uma porta já em uso no host. A validação de integração fica pendente.

## Riscos e rollback

Riscos:

- O segredo HMAC é estático por ambiente; a rotação exige coordenar todos os serviços.
- A máquina que hospeda o `user` precisa rodar o sweeper; com várias réplicas, todas executam a consulta, mas a liberação é idempotente.
- O aceite não bloqueia a transição manual para `delivered`; a regra de negócio ainda é permissiva.
- A limpeza física apaga histórico de eventos; em caso de auditoria, é preciso arquivar antes.
- O tracing não é exportado e as métricas não são agregadas entre réplicas.
- As migrações não foram executadas contra um banco real nesta validação.

Rollback:

- Reverter o PR remove HMAC, aceite/recusa, sweeper, DLQs, limpeza e métricas.
- As migrações têm `down` que remove os índices e colunas novas de reserva.
- Para voltar ao comportamento antigo sem novo deploy, desative o sweeper (`COURIER_RESERVATION_SWEEP_ENABLED=false`), a limpeza (`OUTBOX_CLEANUP_ENABLED=false`) e o rate limit distribuído (`RATE_LIMIT_REDIS_ENABLED=false`).

## Próximo passo sugerido

- Testar as migrações e o fluxo completo com Floci, PostgreSQL, SNS, SQS e Redis.
- Exportar tracing com OpenTelemetry e criar dashboards/alertas para métricas e DLQs.
- Tornar o outbox do `payment` e do `user` atômico com o estado de domínio.
