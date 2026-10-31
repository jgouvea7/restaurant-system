# Fase 0 - Baseline de CI e testes

Branch: `chore/phase-0-ci-baseline`

## Contexto

O repositório não possuía CI e a suíte de testes não estava verde. Os testes gerados pelo NestJS falhavam por dependências não mockadas, e o `user` também falhava por imports absolutos com prefixo `src/` não resolvidos pelo Jest.

Sem esse baseline, qualquer fase seguinte correria o risco de introduzir regressões sem validação automática. Esta fase não altera regras de negócio; ela cria a rede de segurança para as fases de Redis GEO, eventos e novos microsserviços.

## O que mudou

### CI

- `.github/workflows/ci.yml`
  - Executa em `push`, `pull_request` para `main` e `workflow_dispatch`.
  - Matriz para `auth`, `user`, `restaurant`, `aws` e `libs`.
  - Cada serviço roda `npm ci`, `npm run build` e, quando aplicável, `npm test -- --runInBand`.
  - Job separado de Terraform: `terraform fmt -check -recursive`, `terraform init -backend=false` e `terraform validate`.
  - Job separado de Compose: `docker compose config --quiet`.
  - Usa Node.js 24 no CI.

### Template e documentação

- `.github/pull_request_template.md`
  - Padroniza contexto, alterações, funcionamento, decisões, alternativas, tradeoffs, impacto operacional, validação, riscos, rollback, dívidas e próximo passo.
- `CONTRIBUTING.md`
  - Documenta pré-requisitos, estrutura, comandos de build/teste, validação de Terraform/Compose e fluxo de branches/PRs.
- `docs/phases/fase-0.md`
  - Este relatório.

### Testes

- `user/package.json`
  - Adicionado `moduleNameMapper` para resolver imports `src/*` no Jest.
- Specs de controllers em `user` e `restaurant`
  - Services passam a ser mockados com `{ provide: Service, useValue: {} }`, evitando que o Nest tente resolver dependências reais.
- Specs de services em `user`
  - `CourierService` e `OwnerService` recebem mock de `DataSource`.
- Specs de services em `restaurant`
  - `RestaurantsService` recebe mocks de `DataSource` e `GeolocationService`.
  - `RestaurantAddressService` recebe mock de `GeolocationService`.

### Dependência ESM

- `user` e `restaurant`
  - Removida a dependência `@nestjs/mapped-types`.
  - Criado `src/common/partial-type.ts` com uma implementação local de `PartialType`.
  - Os DTOs de update passaram a importar o helper local.
- `user/package-lock.json` e `restaurant/package-lock.json`
  - Atualizados após a remoção da dependência.

## Como funciona

O CI é dividido em três jobs independentes:

1. `node`: valida instalação reprodutível (`npm ci`), build e testes dos serviços Node.
2. `terraform`: valida formatação, inicialização sem backend e sintaxe da infraestrutura.
3. `compose`: valida o arquivo `docker-compose.yml`.

O job `node` usa matriz com `fail-fast: false`, permitindo identificar todos os serviços quebrados em uma única execução. Dependências compartilhadas são compiladas pelos próprios scripts de build de `user` e `restaurant`, que executam `build:libs` e `build:aws`.

## Decisões e motivos

### Remover `@nestjs/mapped-types` em vez de configurar transform no Jest

A versão instalada (`12.0.0`) é publicada como ESM (`"type": "module"`). O Jest 30 em Node.js 22 não consegue carregar esse pacote como CommonJS, mesmo com `babel-jest` configurado para `node_modules`. A mensagem do próprio Jest recomenda Node.js 24.9+ para `require(esm)`.

Alternativas consideradas:

- Atualizar o runtime local para Node.js 24.9+. O CI já usa Node.js 24, mas isso não resolve ambientes locais em Node.js 22 e adiciona acoplamento de versão.
- Mapear `@nestjs/mapped-types` para um shim apenas no Jest. Resolveria o teste, mas manteria uma dependência ESM sem uso real no projeto.
- Fazer downgrade do pacote. O registro disponível não oferece uma versão 11 compatível; as versões publicadas saltam de `2.1.1` para `12.0.0`.

A solução local elimina a dependência, mantém o build e os testes independentes de ESM e preserva o comportamento necessário: os DTOs de update herdam as propriedades do DTO de criação. O projeto ainda não usa `class-validator`, então a cópia de metadados de validação feita pelo pacote original não é necessária hoje.

Tradeoff: se `class-validator` for introduzido, o helper local precisará ser reavaliado para aplicar metadados de opcionalidade.

### Mockar dependências em vez de importar módulos reais

Os specs gerados pelo NestJS não mockavam `DataSource`, `GeolocationService` e os services injetados. Testes unitários devem isolar a unidade e não abrir conexão com banco nem depender de rede. Por isso, os specs passaram a usar `useValue` para as dependências.

### Não incluir lint no CI nesta fase

O lint atual possui 240 problemas no `user` e 142 no `restaurant`, majoritariamente formatação antiga e tipos implícitos. Corrigir tudo agora aumentaria muito o escopo da Fase 0 e misturaria mudanças mecânicas com a baseline. O lint fica registrado como dívida para uma fase de hardening.

## Impacto operacional

- Nenhuma variável de ambiente nova.
- Nenhuma migração de banco.
- Nenhuma alteração de contrato HTTP.
- Nenhuma alteração de infraestrutura aplicada; apenas validação estática.
- O CI passa a ser obrigatório para validar PRs, mas a branch protection ainda precisa ser configurada no GitHub.

## Validação executada

- `auth`: `npm ci`, `npm run build`, `npm test -- --runInBand` - 1 suíte e 1 teste aprovados.
- `user`: `npm ci`, `npm run build`, `npm test -- --runInBand` - 11 suítes e 11 testes aprovados.
- `restaurant`: `npm ci`, `npm run build`, `npm test -- --runInBand` - 9 suítes e 9 testes aprovados.
- `aws`: `npm ci`, `npm run build` - aprovado.
- `libs`: `npm ci`, `npm run build` - aprovado.
- `terraform fmt -check -recursive` - aprovado com Terraform 1.9.8.
- `terraform init -backend=false -input=false` - aprovado.
- `terraform validate` - aprovado.
- `docker compose config --quiet` - aprovado.

## Riscos e rollback

Riscos:

- A remoção de `@nestjs/mapped-types` altera a implementação dos DTOs de update, embora não altere o contrato observável atual.
- O CI ainda não roda lint, então problemas de estilo não bloqueiam merges.
- A branch protection não é configurada por código; precisa ser habilitada manualmente no GitHub se desejado.

Rollback:

- Reverter o commit/PR da Fase 0 restaura a dependência original e as configurações anteriores de teste. Como não há migração de dados nem alteração de infraestrutura, o rollback é seguro.

## Dívidas e próximo passo

Dívidas:

- Limpar o lint e adicionar `npm run lint` ao CI.
- Avaliar a substituição do helper local por uma solução oficial quando houver upgrade para Node.js 24.9+ em todos os ambientes.
- Configurar branch protection e required checks no GitHub.

Próximo passo:

- Fase 1: fundação de Redis GEO, contratos de eventos, SNS/SQS e endpoints de courier.
