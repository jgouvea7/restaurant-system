# Fase 2 - Pedidos, pagamentos e eventos assíncronos

## Contexto

A Fase 1 entregou a fundação de eventos e os índices geográficos. A Fase 2 fecha o primeiro fluxo de negócio ponta a ponta: o cliente cria um pedido no `restaurant`, o `payment` consome o evento, simula a aprovação e o `restaurant` atualiza o status do pedido de forma assíncrona.

Também foi necessário implementar o CRUD de produtos, que ainda não existia, para que pedidos pudessem referenciar itens reais.

## Alterações

### Contratos e consumer de eventos

- `aws/events/event.types.ts`: novos eventos `order.created`, `order.status.changed`, `payment.approved` e `payment.rejected`.
- `aws/events/event-consumer.service.ts`:
  - long polling via `start()`/`stop()`;
  - `pollIntervalMs` configurável;
  - inicialização do cliente SQS no construtor, garantindo que o consumer esteja pronto antes do bootstrap dos módulos de domínio.
- `EventConsumerService.receive` mantém a mensagem na fila quando o handler falha, preservando a semântica de pelo menos uma vez.

### Produtos

- `POST/GET/PATCH/DELETE /products` no `restaurant`.
- `CreateProductDto` aceita nome, descrição, preço, categoria, disponibilidade e flags de exibição.
- O pedido valida que o produto existe, pertence ao restaurante e está ativo/disponível.

### Pedidos

- Entidades `Order` e `OrderItem` com snapshot de nome e preço do produto.
- `POST /orders`, `GET /orders?restaurantId=&costumerUserId=`, `GET /orders/:id` e `PATCH /orders/:id/status`.
- Status: `pending_payment`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `delivered`, `cancelled` e `payment_rejected`.
- Transições manuais validadas em `OrdersService`; `delivered`, `cancelled` e `payment_rejected` são finais. O create publica `order.created`; mudanças de status publicam `order.status.changed`.
- `OrderPaymentEventsConsumer` consome `payment.approved`/`payment.rejected` e só altera pedidos ainda em `pending_payment`.

### Pagamento

- Novo microsserviço `payment` com NestJS, TypeORM e PostgreSQL próprio (`payment-db`, porta `17003`).
- Entidade `Payment` com `orderId` único, valor, método, status e motivo da rejeição.
- `PaymentEventsConsumer` consome `order.created` e publica `payment.approved` ou `payment.rejected`.
- Aprovação simulada: pedidos com valor maior que zero e menor ou igual a `PAYMENT_APPROVAL_LIMIT` (padrão `1000`) são aprovados.
- `GET /payments/:orderId` consulta o resultado.
- Idempotência: se já existe pagamento para o pedido, o consumer não cria outro nem republica o evento. Conflito de chave única também é tratado.

### Infraestrutura

- `infra/main.tf`:
  - `payment-db` na porta `17003`;
  - ALB, target group, listener `8082`, launch template e ASG do `payment`;
  - fila `payment-events` com filtro `eventType = ["order.created"]`;
  - fila `restaurant-events` com filtro `eventType = ["payment.approved", "payment.rejected"]`;
  - políticas SQS e assinaturas SNS com `raw_message_delivery = true`.
- `infra/floci/ec2-image-catalog.yaml`: AMI `ami-payment-app`.
- `infra/outputs.tf`: URL, ASG, banco e filas do `payment`.
- `docker-compose.yml`: `payment-image`, porta `8082` e dependência no `terraform`.
- `payment/Dockerfile`: imagem do serviço com o pacote `aws` compartilhado.
- `.github/workflows/ci.yml`: job `payment` na matriz de build/teste.

## Como funciona

1. O cliente cria o pedido em `POST /orders`.
2. O `restaurant` valida restaurante, produtos, disponibilidade e calcula o total.
3. O pedido é salvo como `pending_payment` e o evento `order.created` é publicado no SNS.
4. A assinatura filtrada entrega o evento em `payment-events`.
5. O `payment` cria o registro, decide aprovar ou rejeitar e publica `payment.approved`/`payment.rejected`.
6. A assinatura filtrada entrega o resultado em `restaurant-events`.
7. O `restaurant` consome o resultado e muda o pedido para `confirmed` ou `payment_rejected`.
8. O restaurante avança o pedido manualmente por `preparing`, `ready`, `out_for_delivery` e `delivered`.

## Decisões e tradeoffs

### Aprovação simulada por limite

Não há integração com gateway de pagamento. O limite configurável por `PAYMENT_APPROVAL_LIMIT` permite testar os dois caminhos sem dependência externa.

Tradeoff: o resultado é determinístico e simplificado; não modela cartão recusado, antifraude, estorno ou cobrança assíncrona.

### Filas separadas com filtros

Cada consumidor recebe apenas os eventos que entende. Isso reduz tráfego, evita que o `payment` processe eventos de pagamento e permite escalar cada consumer separadamente.

Tradeoff: novos tipos de evento exigem atualizar o filtro da assinatura correspondente. Uma fila sem filtro seria mais simples, mas acoplaria todos os serviços a todos os eventos.

### Snapshot de preço e nome no item

O pedido mantém o preço e o nome do produto no momento da compra. Alterações posteriores no cardápio não mudam pedidos antigos.

Tradeoff: há duplicação de dados e o snapshot não acompanha promoções ou correções retroativas.

### Idempotência simples

O `payment` usa `orderId` único e verifica pagamentos existentes antes de processar. O `restaurant` ignora eventos de pagamento quando o pedido não está mais em `pending_payment`.

Tradeoff: a idempotência é local ao banco e suficiente para o cenário didático. Não há outbox, deduplicação persistente de eventos ou retentativa coordenada entre serviços.

### Publicação não bloqueante

Assim como na Fase 1, falhas de publicação de eventos são registradas e não desfazem a transação principal.

Tradeoff: um pedido pode ficar em `pending_payment` sem evento publicado se o SNS estiver indisponível. A solução definitiva é outbox com relay.

### Status manual e status por evento

O pagamento só altera `pending_payment`. O avanço operacional do pedido é manual para manter o escopo da fase pequeno.

Tradeoff: não há matching automático de entregador nem atualização de status por entregador. Esses fluxos ficam para as próximas fases.

## Validação

- `restaurant`: build, 10 suítes e 22 testes aprovados.
- `payment`: build, 2 suítes e 5 testes aprovados.
- `user`: build, 11 suítes e 16 testes aprovados.
- `auth`: 1 suíte e 1 teste aprovados.
- `aws`: build aprovado.
- `libs`: build aprovado.
- `terraform fmt -check -recursive`: sem alterações pendentes.
- `terraform validate`: configuração válida.
- `docker compose config --quiet`: configuração válida.

Não foi possível executar `docker compose build`, `terraform apply` nem subir o Floci porque o daemon do Docker não estava disponível. A validação de integração real com SNS, SQS, RDS e ALB fica pendente.

## Riscos e rollback

Riscos:

- O Floci pode não suportar integralmente `filter_policy` ou `aws_sqs_queue_policy`. Se o apply falhar, simplificar as assinaturas e validar a entrega no emulador.
- A entrega é pelo menos uma vez; consumidores precisam continuar idempotentes.
- Sem outbox, eventos podem ser perdidos quando o SNS falha.
- `synchronize: true` é aceitável para o ambiente didático, mas não para produção.
- Não há autenticação/autorização nos endpoints de pedidos e pagamentos.
- O pagamento confia no total enviado pelo `restaurant`; não há assinatura ou validação cruzada.
- O `payment` não faz estorno quando um pedido é cancelado após aprovação.

Rollback:

- Reverter o PR remove o serviço `payment`, as entidades de pedido, os endpoints de produto/pedido e os novos eventos.
- O Terraform remove `payment-db`, ALB/ASG do `payment` e as duas filas no próximo apply.
- Não há migração versionada; o schema é criado por `synchronize`.
- As imagens `payment-app:latest` e a AMI do catálogo podem ser removidas manualmente.

## Dívidas e próximo passo

Dívidas:

- Adicionar testes de integração com Floci, PostgreSQL e SQS.
- Implementar outbox e retentativa para eventos críticos.
- Adicionar autenticação e autorização nos endpoints.
- Modelar cancelamento com estorno no `payment`.
- Adicionar matching de entregador e atualização de status pelo entregador.
- Limpar o lint e incluí-lo no CI.

Próximo passo:

- Fase 3: autenticação, autorização e integração do fluxo de pedidos com entregadores.
