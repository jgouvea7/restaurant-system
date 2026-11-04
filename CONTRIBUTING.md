# Contribuindo

## Pré-requisitos

- Node.js 24
- Docker com Docker Compose
- Terraform 1.9 ou superior

## Estrutura

- `auth`: autenticação, JWT e sessões de refresh
- `user`: usuários, clientes, entregadores e proprietários
- `restaurant`: restaurantes, endereços, horários, produtos e pedidos
- `payment`: pagamentos simulados e publicação de eventos
- `aws`: integrações compartilhadas com AWS/Floci
- `libs`: serviços compartilhados, incluindo geolocalização e guardas JWT
- `infra`: infraestrutura Terraform
- `docker-compose.yml`: ambiente local com Floci

## Desenvolvimento local

Cada serviço Node possui seu próprio `package.json` e lockfile. Instale e valide dentro do diretório do serviço:

```bash
cd user
npm ci
npm run build
npm test -- --runInBand
```

Os serviços `user`, `restaurant`, `payment` e `auth` compilam `libs` e/ou `aws` como parte do build. Para alterações nesses pacotes compartilhados, valide também:

```bash
cd aws
npm ci
npm run build

cd ../libs
npm ci
npm run build
```

## Infraestrutura

```bash
cd infra
terraform fmt -check -recursive
terraform init -backend=false -input=false
terraform validate
```

Valide o Compose na raiz:

```bash
docker compose config --quiet
```

## Fluxo de branches e PRs

- Cada fase usa uma branch própria a partir da `main` atualizada.
- Abra o PR e use o template com contexto, decisões, tradeoffs, validação e rollback.
- O CI roda build, testes, Terraform e Compose. Se tudo passar e o PR for aberto pela conta `jgouvea7`, o job `Auto merge` faz o merge commit e apaga a branch. PRs de outras contas precisam de merge manual.
- Para segurar o merge, mantenha o PR como draft; o auto-merge não roda em drafts.
- Após o merge, atualize a `main` antes de iniciar a próxima fase.
- Branches `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*` e `test/*` já mescladas podem ser limpas pelo workflow `Cleanup merged branches`.

## Testes

- Specs de controllers devem mockar o service injetado.
- Specs de services devem mockar `DataSource`, `GeolocationService` e demais dependências externas.
- Importações absolutas com prefixo `src/` são resolvidas pelo `moduleNameMapper` do Jest no serviço `user`.

## Dívidas conhecidas

- O lint ainda aponta problemas antigos de formatação e tipos em vários arquivos. O CI atual valida build, testes, Terraform e Compose; lint será incorporado após a limpeza da base.
