# Backend tasks

- [x] Fase 1 — Base: reorganizar `src`, configurar ambiente validado, resposta global `{ message, code }`, validação e remoção do SSH legado.
- [ ] Fase 2 — Dados: configurar PostgreSQL/TypeORM, entities, migrations e seeds; usar `cidr` para subnet; manter `synchronize` desabilitado em produção.
  - [x] Configurar PostgreSQL/TypeORM, entities e migration inicial com `cidr` e `synchronize=false`.
  - [ ] Criar seeds.
- [x] Fase 3 — Usuários e auth: cadastro público de professor pendente, Argon2, JWT, guard e erro `ACCOUNT_INACTIVE`.
- [ ] Fase 4 — Laboratórios e histórico: CRUD, controle de status, auditoria e permissões necessárias.
  - [x] Implementar consulta, cadastro e alteração de status de laboratórios com auditoria.
  - [x] Implementar consulta de histórico com snapshots e ordenação decrescente.
- [x] Fase 5 — Firewall: serviço interno no `FirewallModule`, SSH por chave privada, comandos IPTables permitidos e aplicação anterior à confirmação do status.
- [ ] Fase 6 — Qualidade: testes unitários, integração e e2e; documentação de ambiente e execução das migrations.

## Pendências de desenho

- [ ] Definir papéis administrativos e como ativam professores (por enquanto, atualização manual no banco).
- [ ] Definir modelo de histórico e política de retenção.
- [ ] Definir host, chave, privilégios mínimos e regras IPTables do servidor de firewall.
