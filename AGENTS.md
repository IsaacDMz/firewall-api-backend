# UTFPR Lab Guard Backend

## Arquitetura

- NestJS por feature em `src/modules/{auth,users,labs,history,firewall}`; código transversal em `src/common`, configuração em `src/config` e dados em `src/database`.
- PostgreSQL + TypeORM; migrations em `src/database/migrations` e seeds em `src/database/seeds`. Use `cidr` para sub-redes. Nunca habilite `synchronize` em produção.
- Evite camadas genéricas sem necessidade para o TCC.

## Domínio e segurança

- Cadastro público cria somente `role=PROFESSOR` e `isActive=false`; esses campos nunca vêm do cliente.
- A ativação inicial é manual pelo responsável: `UPDATE users SET is_active = true WHERE id = '<uuid>';`.
- Senhas usam Argon2. JWT protege rotas autenticadas. Usuário inativo não autentica e recebe `{ message, code: 'ACCOUNT_INACTIVE' }`.
- Todos os erros da API usam `{ message, code }`.
- Não existe endpoint de SSH arbitrário. SSH pertence apenas ao `FirewallModule`, autentica com chave privada e só executa comandos IPTables previamente definidos.
- Mudança de status de laboratório deve aplicar o firewall antes de confirmar sucesso e registrar histórico.

## Convenções

- Arquivos e rotas em kebab-case; classes TypeScript em PascalCase; DTOs validam entrada.
- Controllers orquestram HTTP; services concentram regra de negócio; entities e migrations representam persistência.
- Configuração só via ambiente validado; segredos não são versionados.

## Endpoints planejados

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Operações administrativas de usuários a definir.
- CRUD de `labs`, `PATCH /labs/:id/status`, consulta de `history`.
- Não expor endpoints SSH; o firewall é chamado internamente pelo fluxo de laboratórios.

## Fluxo de autenticação

1. Registro público cria professor pendente, com hash Argon2.
2. Login valida credenciais e atividade; inativo falha com `ACCOUNT_INACTIVE`.
3. Login ativo emite JWT; guard extrai o usuário para as rotas protegidas.

## Firewall

- Cada laboratório tem subnet `cidr` e estado de Internet.
- Gere comandos a partir de dados validados, sem interpolar comandos fornecidos pelo cliente.
- SSH por chave privada, com timeout, erro controlado e registro da mudança apenas após aplicação bem-sucedida.

## Testes

- Unitários para auth, regras de status e composição de comandos.
- Integração para repositories/migrations PostgreSQL e e2e para registro, login, inatividade e alteração de status.
