# Fase 1 - Fundação de dados e eventos

## Contexto

A Fase 0 criou a baseline de CI e testes. A Fase 1 prepara a base compartilhada para os próximos serviços: índices geográficos no Redis, contratos de eventos no SNS/SQS e os endpoints de localização e disponibilidade dos entregadores.

O objetivo é entregar fundação reutilizável, sem acoplar ainda as regras de pedidos, pagamentos ou matching de entregadores.

## Alterações

### Redis GEO

- `aws/elastic-cache/elastic-cache.constants.ts`: chaves `restaurants:geo`, `couriers:geo` e `couriers:available`.
- `aws/elastic-cache/elastic-cache.service.ts`:
  - conexão preguiçosa com `ioredis`, configuração por `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD`;
  - operações `addLocation`, `addLocations`, `findNearby`, `getPosition` e `removeLocation`;
  - operações de conjunto `addToSet`, `removeFromSet` e `getSetMembers`.
- `restaurant`: restauração do índice `restaurants:geo` no cadastro e remoção do índice ao excluir.
- `user`: localização do entregador em `couriers:geo` e disponibilidade em `couriers:available`.

### Eventos

- `aws/events/event.types.ts`: envelope `DomainEvent` e tipos:
  - `restaurant.created`;
  - `restaurant.deleted`;
  - `courier.location.updated`;
  - `courier.availability.changed`.
- `aws/events/event-publisher.service.ts`: publicação no SNS com `MessageAttributes`.
- `aws/events/event-consumer.service.ts`: leitura e confirmação de mensagens SQS, com handler injetado.
- `aws/events/events.module.ts`: módulo compartilhado exportando publisher e consumer.
- `restaurant` e `user` publicam eventos de domínio. Falhas de publicação são registradas e não interrompem a operação principal.

### Endpoints de courier

- `PATCH /courier/:id/location`: atualiza a posição no Redis GEO.
- `GET /courier/:id/location`: consulta a posição atual.
- `PATCH /courier/:id/availability`: define explicitamente disponibilidade.
- `POST /courier/:id/available`: mantido para alternar o estado atual.
- `GET /courier/nearby?latitude&longitude&radiusKm&limit`: retorna somente entregadores disponíveis, ordenados por distância.

### Infraestrutura

- `infra/main.tf`: assinatura SNS → SQS com `raw_message_delivery = true`.
- Política da fila permitindo `sns.amazonaws.com` enviar mensagens do tópico `events`.
- Variáveis `SNS_TOPIC_ARN`, `SQS_QUEUE_URL`, `SERVICE_NAME` e `USER_SERVICE_URL` adicionadas aos Dockerfiles.

## Como funciona

1. O restaurante é criado e o endereço é geocodificado.
2. O ID do restaurante é salvo em `restaurants:geo` com longitude e latitude.
3. A busca de restaurantes próximos usa `GEOSEARCH` e busca os dados no PostgreSQL.
4. O entregador atualiza a posição via `PATCH /courier/:id/location`.
5. A posição vai para `couriers:geo`; se estiver disponível, o ID também entra em `couriers:available`.
6. A busca de entregadores próximos cruza o resultado do `GEOSEARCH` com o conjunto de disponíveis.
7. Eventos são publicados no SNS; o Terraform entrega as mensagens na fila SQS.

## Decisões e tradeoffs

### Redis GEO para restaurantes e entregadores

Redis 7 oferece `GEOSEARCH` com ordenação por distância e baixa latência. O PostgreSQL continua sendo a fonte da verdade; o Redis é um índice derivado.

Tradeoff: o índice pode ficar temporariamente inconsistente se uma escrita no Redis falhar. O código registra a falha e mantém a operação principal; uma futura rotina de reconciliação pode corrigir divergências.

### Disponibilidade em conjunto separado

A posição e a disponibilidade ficam em chaves diferentes. Isso permite manter a última posição conhecida mesmo quando o entregador está indisponível.

Tradeoff: a busca precisa cruzar dois resultados em memória. Para o volume didático atual é adequado; em escala maior, o conjunto de disponíveis poderia ser particionado por região ou substituído por um índice geográfico separado apenas com disponíveis.

### Publicação de eventos não bloqueante

`EventPublisherService.publish` registra o erro e retorna `null` quando o SNS falha. O cadastro do restaurante ou a atualização do entregador não falham por indisponibilidade momentânea da mensageria.

Tradeoff: não há garantia de entrega nesta fase. O próximo passo é adicionar outbox ou retentativa para eventos críticos.

### Validação do owner fora da transação

A chamada HTTP ao serviço `user` foi movida para antes da transação do PostgreSQL. Isso reduz o tempo de transação aberta e evita manter locks durante uma chamada de rede.

Tradeoff: se o owner for removido entre a validação e o commit, o restaurante ainda pode ser criado. Não há chave estrangeira entre bancos; a consistência é eventual.

### Endereço precisa ser geocodificável

O cadastro de restaurante agora retorna `400` quando o CEP não existe ou quando o Nominatim não devolve coordenadas. Antes, valores nulos podiam chegar a colunas `NOT NULL` e gerar erro de banco.

## Validação

- `user`: build, 11 suítes e 16 testes aprovados.
- `restaurant`: build, 9 suítes e 12 testes aprovados.
- `aws`: build aprovado.
- `libs`: build aprovado.
- `auth`: build e teste aprovados na baseline da Fase 0.
- `terraform fmt -recursive`: sem alterações pendentes.
- `terraform init -backend=false`: provedor AWS 6.69.1 reutilizado.
- `terraform validate`: configuração válida.
- `docker compose config --quiet`: configuração válida.

Não foi possível executar `terraform apply` nem subir o Floci nesta sessão porque o daemon do Docker não estava disponível. A validação de integração com Redis e SNS/SQS fica pendente.

## Riscos e rollback

Riscos:

- A integração real com Redis, Floci, SNS e SQS não foi executada; os testes usam mocks.
- Os eventos usam entrega pelo menos uma vez. Consumidores precisam ser idempotentes.
- A localização do entregador é mantida apenas no Redis; reinícios sem persistência podem perder posições.
- A política da fila SQS pode não ser suportada integralmente pelo Floci. Se o apply falhar, remover `aws_sqs_queue_policy.events` e validar a entrega no emulador.

Rollback:

- Reverter o PR remove endpoints, publisher, consumer e assinatura SNS → SQS.
- O Terraform remove a assinatura e a política no próximo apply.
- Não há migração de banco. As chaves `restaurants:geo`, `couriers:geo` e `couriers:available` podem ser removidas manualmente.

## Dívidas e próximo passo

Dívidas:

- Adicionar teste de integração com Redis e Floci.
- Implementar outbox ou retentativa para eventos críticos.
- Adicionar idempotência nos consumidores.
- Limpar o lint e incluí-lo no CI.

Próximo passo:

- Fase 2: consumer de eventos, pedidos e fluxo assíncrono entre `restaurant`, `user` e `payment`.
