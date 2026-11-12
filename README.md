# UTFPR Lab Guard API

Backend NestJS para autenticação, laboratórios, histórico e controle de Internet por um host firewall via SSH.

## Requisitos

- Node.js 24.15 ou superior (LTS atual)
- npm
- Docker com Docker Compose, para o PostgreSQL local
- Um host firewall SSH configurado conforme [docs/firewall-remote.md](docs/firewall-remote.md), caso vá alterar o status de laboratórios

## Execução local

Instale as dependências:

```powershell
npm ci
```

Crie o arquivo de ambiente:

```powershell
Copy-Item .env.example .env
```

Edite `.env`. Para o PostgreSQL do Compose, mantenha `DATABASE_PASSWORD=postgres`. Defina segredos JWT diferentes, com pelo menos 32 caracteres cada. Por exemplo:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Preencha também as variáveis `SSH_*`. A chave privada deve estar em um caminho local seguro e não deve ser versionada. O fingerprint do host deve ser conferido fora da aplicação. Consulte [docs/firewall-remote.md](docs/firewall-remote.md) para configurar o usuário, `sudoers`, script remoto e chain `LAB_GUARD`.

Inicie o banco:

```powershell
docker compose up -d db
```

Execute as migrations e inicie a API:

```powershell
npm run migration:run
npm run dev
```

A API estará em `http://localhost:3000/api` e a documentação Swagger em `http://localhost:3000/api/docs`.

## Listagem de laboratórios

`GET /api/labs` requer `Authorization: Bearer <access_token>` de um professor ou administrador ativo. O parâmetro opcional `blockId` aceita o UUID v4 retornado pela API de blocos:

```http
GET /api/labs
GET /api/labs?blockId=faabce83-c7eb-4df6-a509-5722fc599339
```

Sem o parâmetro, retorna todos os laboratórios. Com `blockId`, retorna somente os laboratórios daquele bloco. A resposta HTTP 200 é sempre um array, ordenado por `name` em ordem crescente, com os mesmos campos:

```json
[
  {
    "id": 1,
    "name": "Lab 1",
    "block": { "id": "faabce83-c7eb-4df6-a509-5722fc599339", "name": "Bloco A" },
    "subnet": "192.168.10.0/24",
    "status": "bloqueado"
  }
]
```

Blocos sem laboratórios (inclusive UUIDs válidos inexistentes) retornam `[]`. Um `blockId` inválido ou vazio retorna HTTP 400 com `{ "message": "blockId must be a UUID", "code": "BAD_REQUEST" }`. A listagem não possui paginação, contagem total ou pesquisa textual.

## Verificação de consistência do firewall

`GET /api/labs/:id/firewall-status` requer `Authorization: Bearer <access_token>` de professor ou administrador ativo. `id` é o identificador inteiro do laboratório. Cada requisição consulta o PostgreSQL e executa somente `labguard-firewall status` via SSH no Router-1.

Exemplo de requisição: `GET /api/labs/1/firewall-status`.

Resposta HTTP 200:

```json
{
  "labId": 1,
  "subnet": "10.1.0.0/24",
  "databaseStatus": "bloqueado",
  "firewallStatus": "bloqueado",
  "isSynchronized": true,
  "checkedAt": "2026-11-11T15:00:00.000Z",
  "error": null
}
```

- `databaseStatus`: status registrado no banco (`bloqueado` ou `liberado`).
- `firewallStatus`: estado observado (`bloqueado`, `liberado` ou `desconhecido`). `liberado` indica ausência de bloqueio no fluxo gerenciado pelo Lab Guard, sem garantir conectividade com a Internet.
- `isSynchronized`: `true` quando os estados coincidem, `false` quando divergem, `null` quando a comparação não pode ser concluída.
- `checkedAt`: instante UTC, em ISO 8601, da conclusão desta tentativa de verificação. Não há cache, agendamento nem persistência da última consulta.
- `error`: `null` ou objeto `{ message, code }`, sem detalhes internos de SSH.

Quando o roteador está inacessível, a resposta continua HTTP 200 com o resultado do diagnóstico:

```json
{
  "labId": 1,
  "subnet": "10.1.0.0/24",
  "databaseStatus": "bloqueado",
  "firewallStatus": "desconhecido",
  "isSynchronized": null,
  "checkedAt": "2026-11-11T15:00:00.000Z",
  "error": {
    "message": "Firewall connection failed",
    "code": "FIREWALL_CONNECTION_FAILED"
  }
}
```

Os códigos de diagnóstico são `FIREWALL_CONNECTION_FAILED`, `FIREWALL_TIMEOUT`, `FIREWALL_COMMAND_FAILED` e `FIREWALL_STATE_UNKNOWN` (regras/saída que não permitem determinar o estado com segurança). Laboratório inexistente retorna HTTP 404 com `LAB_NOT_FOUND`; ID não inteiro retorna HTTP 400 com `BAD_REQUEST`. Autenticação e atividade continuam obrigatórias (401/403).

A consulta compara o registro lido no início da requisição com o estado observado no firewall. Alterações concorrentes podem exigir uma nova consulta. Não corrige divergências, não altera o status no banco nem grava histórico de mudança de status. Consulte o [contrato remoto e o escopo de interpretação das regras](docs/firewall-remote.md#consulta-de-consistência).

## Reconciliação manual do firewall

`POST /api/labs/:id/firewall-reconcile` exige JWT, usuário ativo e as mesmas roles da alteração de status: `PROFESSOR` ou `ADMIN`. O endpoint não aceita campos no corpo; comandos, sub-redes e status enviados pelo frontend são rejeitados com HTTP 400. Utilize o ID inteiro positivo do laboratório:

```http
POST /api/labs/1/firewall-reconcile
Authorization: Bearer <access_token>
```

O banco define a política desejada. A API consulta o firewall, reaplica `block` ou `unblock` somente quando há divergência conhecida e faz uma nova consulta para confirmar o resultado. Se já estiver sincronizado, não executa alterações. A reconciliação nunca modifica o status desejado, não grava uma mudança de status no histórico e não remove regras de outros laboratórios. Não há execução automática, polling ou agendamento.

Resposta HTTP 200, mantendo os campos da consulta e acrescentando `success` e `changeApplied`:

```json
{
  "labId": 1,
  "subnet": "10.1.0.0/24",
  "databaseStatus": "bloqueado",
  "firewallStatus": "bloqueado",
  "isSynchronized": true,
  "checkedAt": "2026-11-11T15:00:00.000Z",
  "error": null,
  "success": true,
  "changeApplied": true
}
```

`changeApplied=false` indica que nenhum comando de alteração foi executado (inclusive quando já estava sincronizado). `true` indica que o executor confirmou o comando; o sucesso da reconciliação depende também da verificação posterior. `null` indica falha na aplicação: o efeito remoto pode ser incerto, por exemplo após perda da conexão. Nesse caso, `firewallStatus=desconhecido` e `isSynchronized=null`.

Erros mantêm `{ message, code }`; quando há um diagnóstico, o campo adicional `details` contém o resultado da operação no mesmo formato da resposta de sucesso:

```json
{
  "message": "Firewall operation timed out",
  "code": "FIREWALL_TIMEOUT",
  "details": {
    "labId": 1,
    "subnet": "10.1.0.0/24",
    "databaseStatus": "bloqueado",
    "firewallStatus": "desconhecido",
    "isSynchronized": null,
    "checkedAt": "2026-11-11T15:00:00.000Z",
    "error": { "message": "Firewall operation timed out", "code": "FIREWALL_TIMEOUT" },
    "success": false,
    "changeApplied": true
  }
}
```

| HTTP | Código | Significado |
| --- | --- | --- |
| 200 | — | Sincronizado, com ou sem reaplicação |
| 400 | `BAD_REQUEST` | ID inválido ou campos indevidos no corpo |
| 401/403 | Códigos de autenticação/autorização existentes | Usuário sem acesso à operação |
| 404 | `LAB_NOT_FOUND` | Laboratório inexistente |
| 409 | `LAB_OPERATION_IN_PROGRESS` | Outra operação mantém o lock do laboratório; repetir após sua conclusão |
| 409 | `FIREWALL_RECONCILIATION_FAILED` | Comando concluído, mas a nova leitura continua divergente; requer intervenção |
| 502 | `FIREWALL_CONNECTION_FAILED`, `FIREWALL_TIMEOUT`, `FIREWALL_COMMAND_FAILED`, `FIREWALL_STATE_UNKNOWN` | Consulta ou aplicação falhou; sincronização não confirmada |

Estados desconhecidos ou ambíguos na consulta inicial impedem a aplicação de comandos. Uma divergência persistente após a aplicação não causa novas tentativas nem remoção ampliada de regras.

Reconciliação, `PATCH /api/labs/:id/status` e `PATCH /api/labs/:id` compartilham um lock de linha `FOR UPDATE NOWAIT`, mantido pela transação PostgreSQL durante toda a operação. Requisições concorrentes para o mesmo laboratório recebem HTTP 409 antes de executar SSH; laboratórios diferentes não compartilham esse lock. A consulta `GET /api/labs/:id/firewall-status` permanece somente de leitura, sem adquirir esse lock.

As ações `LAB_FIREWALL_RECONCILE_REQUESTED` e `LAB_FIREWALL_RECONCILED` registram a tentativa e o resultado na auditoria existente, com ator, laboratório, request ID e diagnóstico (`SUCCESS`/`FAILURE`). Se o registro da tentativa falhar, a API não executa SSH.

Para executar também os testes de concorrência com PostgreSQL, use um banco de desenvolvimento configurado em `.env`, com ao menos dois laboratórios existentes:

```bash
LAB_GUARD_POSTGRES_TESTS=1 npm test -- --runInBand
```

Esses testes usam transações e locks reais, com firewall e auditoria simulados, sem modificar registros ou executar SSH. Sem a variável, os testes de integração são ignorados e os demais testes executam normalmente.

## Ativação inicial de usuários

Cadastros públicos sempre criam professores inativos. Após o cadastro, o responsável deve ativar o usuário manualmente:

```powershell
docker compose exec db psql -U postgres -d lab_guard -c "UPDATE users SET is_active = true WHERE username = 'seu_usuario';"
```

Para permitir a criação de laboratórios, promova um usuário ativo a administrador:

```powershell
docker compose exec db psql -U postgres -d lab_guard -c "UPDATE users SET is_active = true, role = 'ADMIN' WHERE username = 'seu_usuario';"
```

## Comandos úteis

```powershell
npm run build
npm run lint
npm test
npm run migration:revert
```

As migrations atuais são destinadas a um banco novo. Em ambientes que já receberam migrations, alterações de esquema devem ser feitas por uma nova migration, nunca reexecutando a migration inicial.
