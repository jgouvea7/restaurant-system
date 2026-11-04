# Fase 3 - Autenticação, autorização e entregadores

## Contexto

A Fase 2 fechou o fluxo de pedidos e pagamentos, mas todos os endpoints continuavam públicos e o avanço para entrega era manual. A Fase 3 adiciona identidade aos usuários, protege os fluxos de escrita e conecta o pedido `ready` a um entregador disponível.

O `auth` passa a ser um microsserviço completo, com banco próprio, ALB e Auto Scaling. Ele valida credenciais no `user`, emite JWT e persiste sessões de refresh. O `restaurant` usa os papéis do token para autorizar pedidos, produtos e restaurantes e para atribuir entregadores.

## Alterações

### Usuários e credenciais

- `POST /users/authenticate` no `user`: valida email/senha com bcrypt, exige usuário `active` e retorna dados seguros, papéis e ids de perfil.
- Papéis derivados das relações existentes: `owner`, `courier` e `costumer`.
- `User.email` agora é único e os cadastros normalizam o email para minúsculas.
- `GET /courier/:id` adiciona a consulta de perfil usada na atribuição de pedidos.
- Corrigida a relação inversa `Owner.user` (`user.owner`).

### Auth

- Serviço NestJS com TypeORM/PostgreSQL (`auth-db`, porta `17004`).
- `AuthSession` guarda `userId`, email, papéis, ids de perfil, hash SHA-256 do refresh token, expiração e revogação.
- `POST /auth/login`: valida no `user`, cria sessão e devolve access token JWT + refresh token opaco.
- `POST /auth/refresh`: valida o hash, rotaciona o refresh token e devolve um novo par.
- `POST /auth/logout`: revoga o refresh token de forma idempotente.
- `GET /auth/me`: valida o access token e devolve as claims do usuário.
- Access token com `sub`, email, papéis, `ownerId`, `courierId`, `costumerId`, emissor, audiência e expiração configurável.
- `JWT_ACCESS_TOKEN_SECRET`, `ACCESS_TOKEN_TTL_SECONDS` (padrão `900`) e `REFRESH_TOKEN_TTL_SECONDS` (padrão `604800`).

### Guardas compartilhadas

- `libs/auth`: `JwtAuthGuard`, `RolesGuard`, decorator `@Roles`, decorator `@CurrentUser` e tipos/constantes compartilhados.
- O access token é verificado localmente em cada serviço, com algoritmo, emissor e audiência fixos.
- `payment` passou a depender de `libs` para proteger `GET /payments/:orderId`.

### Autorização aplicada

- `POST /restaurants`: owner autenticado, usando o próprio `ownerId`.
- `POST/PATCH/DELETE /products`: owner do restaurante do produto.
- `POST /orders`: cliente autenticado, usando o próprio `userId`.
- `GET /orders` e `GET /orders/:id`: owner do restaurante, cliente do pedido ou entregador atribuído.
- `PATCH /orders/:id/status`: owner do restaurante; cliente somente pode cancelar o próprio pedido; entregador somente pode marcar `delivered`.
- `PATCH /courier/:id/location`, `/availability` e `POST /courier/:id/available`: apenas o próprio entregador.
- Cadastro de usuários, cardápio público, busca de restaurantes/entregadores próximos e health raiz continuam públicos.

### Atribuição de entregador

- `Order` ganhou `courierId` e `courierAssignedAt`.
- Novo `PATCH /orders/:id/courier`, restrito ao owner do restaurante.
- Sem `courierId`, o `restaurant` busca entregadores disponíveis próximos ao endereço do restaurante e escolhe o mais próximo.
- Com `courierId`, o `restaurant` valida existência e disponibilidade antes de atribuir.
- A atribuição só ocorre em `ready`, grava o entregador, move para `out_for_delivery` e publica `order.courier.assigned`.
- A chamada é idempotente quando o pedido já está em `out_for_delivery` com entregador.

### Infraestrutura

- `infra/main.tf`: `auth-db` na porta `17004`, ALB/listener `8083`, target group, launch template e ASG com 3 réplicas.
- `infra/floci/ec2-image-catalog.yaml`: AMI `ami-0c3d4e5f678901a2b` (`auth-app-2026.11`).
- `infra/outputs.tf`: URL, ASG e banco do `auth`.
- `docker-compose.yml`: `auth-image`, porta `8083` e dependência no `terraform`.
- `auth/Dockerfile`: build com `libs` e execução com `ENTRYPOINT`.
- `.github/workflows/ci.yml`: `auth` passou a instalar/compilar `libs`.

## Como funciona

1. O cliente envia email/senha para `POST /auth/login`.
2. O `auth` chama `POST /users/authenticate`; o `user` compara o bcrypt e devolve papéis e ids de perfil.
3. O `auth` assina o JWT e grava o hash do refresh token em `auth-db`.
4. O cliente usa `Authorization: Bearer <accessToken>` nos serviços.
5. Cada serviço valida o JWT localmente e aplica os papéis/ownership.
6. O owner avança o pedido até `ready`.
7. O owner chama `PATCH /orders/:id/courier`; o `restaurant` escolhe/valida o entregador e move para `out_for_delivery`.
8. O entregador usa o token dele para marcar `delivered`.

## Decisões e tradeoffs

### Validar credenciais no `user`

O `auth` não duplica senhas nem criação de usuários. Ele consulta o `user` por HTTP interno e mantém no seu banco apenas sessões.

Tradeoff: o login depende do `user` estar disponível e a senha trafega no corpo da chamada interna. Em produção seria necessário mTLS, token de serviço ou outro mecanismo de confiança entre serviços.

### JWT curto + refresh persistido

O access token é stateless e verificado localmente, evitando uma chamada ao `auth` por requisição. O refresh token é opaco, armazenado como hash e rotacionado.

Tradeoff: um access token roubado continua válido até expirar. Não há denylist de access tokens nem revogação por família de refresh tokens.

### Banco próprio do `auth`

O `auth-db` guarda sessões, não credenciais. Isso preserva `database per service` sem duplicar a fonte de verdade dos usuários.

Tradeoff: login e refresh são operações que cruzam dois serviços. O `auth` também depende da disponibilidade do `user`.

### Entregador mais próximo

A escolha automática reutiliza o Redis GEO e a disponibilidade já existentes no `user`. O `restaurant` não mantém uma cópia do estado dos entregadores.

Tradeoff: não há aceite/recusa, reserva do entregador, expiração de oferta nem liberação automática ao entregar/cancelar. Dois pedidos podem escolher o mesmo entregador se ele continuar disponível no Redis.

### Autorização por ownership no serviço de domínio

Os guards verificam autenticação/papel; o `restaurant` verifica ownership consultando seu banco. Isso mantém as regras de negócio no domínio e evita confiar apenas em claims.

Tradeoff: há consultas adicionais e alguma duplicação de checagens nos controllers/services.

## Validação

- `auth`: build aprovado, 2 suítes e 5 testes.
- `user`: build aprovado, 11 suítes e 20 testes.
- `restaurant`: build aprovado, 10 suítes e 25 testes.
- `payment`: build aprovado, 2 suítes e 5 testes.
- `aws` e `libs`: builds aprovados.
- `terraform fmt -check -recursive`: sem alterações pendentes.
- `terraform validate`: configuração válida.
- `docker compose config --quiet`: configuração válida.

Não foi possível executar `docker compose build`, `terraform apply` nem subir Floci/PostgreSQL porque o daemon do Docker não estava disponível. A validação de integração real com DB, ALB, login e atribuição de entregador fica pendente.

## Riscos e rollback

Riscos:

- `JWT_ACCESS_TOKEN_SECRET` padrão é didático; todos os serviços precisam do mesmo valor.
- Sem outbox, uma falha ao publicar `order.courier.assigned` não desfaz a atribuição.
- O `/users/authenticate` é interno por convenção, mas não tem autenticação de serviço.
- Não há rate limiting, bloqueio por tentativas, MFA ou recuperação de senha.
- `synchronize: true` cria o schema do `auth`; não há migrações versionadas.
- A disponibilidade do entregador não é reservada; o fluxo de matching é simplificado.

Rollback:

- Reverter o PR remove o serviço `auth`, as guardas, a atribuição de entregador e as proteções dos endpoints.
- O Terraform remove `auth-db`, ALB/ASG do `auth` e a porta `8083` no próximo apply.
- A imagem `auth-app:latest` e a AMI do catálogo podem ser removidas manualmente.
- A migration de schema é recriada por `synchronize` ao subir a versão anterior; não há migração versionada para reverter dados de sessão.

## Dívidas e próximo passo

Dívidas:

- Adicionar autenticação de serviço para `/users/authenticate` e chamadas internas.
- Adicionar denylist/rotação de access tokens e famílias de refresh tokens.
- Modelar aceite/recusa, reserva e liberação automática do entregador.
- Adicionar outbox, health checks e observabilidade.
- Cobrir login, refresh, guards e atribuição com testes de integração usando Floci/PostgreSQL.
- Adicionar rate limiting e política de senha.
- Limpar o lint e incluí-lo no CI.

Próximo passo sugerido:

- Fase 4: outbox/idempotência persistente, health checks, observabilidade e endurecimento de segurança para produção.
