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
