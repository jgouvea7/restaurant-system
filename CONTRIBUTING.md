# Contribuindo

## Pré-requisitos

- Node.js 24
- Docker com Docker Compose
- Terraform 1.9 ou superior

## Estrutura

- `auth`: autenticação
- `user`: usuários, clientes, entregadores e proprietários
- `restaurant`: restaurantes, endereços, horários e produtos
- `aws`: integrações compartilhadas com AWS/Floci
- `libs`: serviços compartilhados, incluindo geolocalização
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

Os serviços `user` e `restaurant` compilam `libs` e `aws` como parte do build. Para alterações nesses pacotes compartilhados, valide também:

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
- Abra o PR como draft, aguarde o CI e marque como pronto após a validação.
- Use o template do PR com contexto, decisões, tradeoffs, validação e rollback.
- Não faça merge sem aprovação explícita.
- Após o merge, atualize a `main` antes de iniciar a próxima fase.

## Testes

- Specs de controllers devem mockar o service injetado.
- Specs de services devem mockar `DataSource`, `GeolocationService` e demais dependências externas.
- Importações absolutas com prefixo `src/` são resolvidas pelo `moduleNameMapper` do Jest no serviço `user`.

## Dívidas conhecidas

- O lint ainda aponta problemas antigos de formatação e tipos em vários arquivos. O CI atual valida build, testes, Terraform e Compose; lint será incorporado após a limpeza da base.
