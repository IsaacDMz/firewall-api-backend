# Firewall remoto

Use um usuário Linux dedicado, por exemplo `labguard`, sem senha e sem acesso administrativo geral. A chave pública do backend fica em `~labguard/.ssh/authorized_keys`; a chave privada fica fora do repositório, no caminho de `SSH_PRIVATE_KEY_PATH`.

Em `/etc/sudoers.d/labguard`, com `visudo`:

```sudoers
Cmnd_Alias LABGUARD_FIREWALL = /usr/local/sbin/labguard-firewall *
labguard ALL=(root) NOPASSWD: LABGUARD_FIREWALL
```

O script deve ser `root:root`, modo `0750`, validar rigorosamente os quatro argumentos (`block|unblock`, CIDR IPv4 canônico, ID positivo e interface) e manipular somente a chain dedicada:

```bash
iptables -N LAB_GUARD 2>/dev/null || true
iptables -C FORWARD -j LAB_GUARD 2>/dev/null || iptables -I FORWARD -j LAB_GUARD
# block:   iptables -A LAB_GUARD -s "$subnet" -o "$wan" -m comment --comment "labguard:$id" -j REJECT
# unblock: remova somente a regra com esse subnet, WAN e comentário.
```

Para alterações de status, o backend chama `/usr/local/sbin/labguard-firewall block|unblock <subnet> <labId> <wan-interface>`. Fixe `SSH_HOST_FINGERPRINT` no formato `SHA256:<base64>` da chave pública do host. Persista as regras após reboot com `iptables-persistent`/`netfilter-persistent` ou um serviço systemd que restaure `iptables-save`.

## Consulta de consistência

O executor instalado no Router-1 também aceita `status`, sem outros argumentos. A API reutiliza essa operação pelo mesmo serviço SSH, chave, fingerprint e timeouts:

```bash
/usr/bin/sudo -n /usr/local/sbin/labguard-firewall status
```

O ramo `status` deve executar somente consultas e sair antes de qualquer criação de chain ou inserção/remoção de regras. O executor atual contém:

```bash
if [[ "$ACTION" == status && $# -eq 1 ]]; then
  "$IPT" -w -S FORWARD
  if "$IPT" -w -nL "$CHAIN" >/dev/null 2>&1; then "$IPT" -w -S "$CHAIN"; fi
  exit 0
fi
```

Exemplo de saída compatível:

```text
-P FORWARD ACCEPT
-A FORWARD -j LAB_GUARD
-N LAB_GUARD
-A LAB_GUARD -s 10.1.0.0/24 -o eth0 -m comment --comment "labguard:12" -j REJECT --reject-with icmp-port-unreachable
```

A API interpreta a topologia gerenciada pelo Lab Guard: política `FORWARD ACCEPT`, salto incondicional para `LAB_GUARD` e regras `REJECT` do executor. Compara sub-redes numericamente, considerando o endereço de rede mesmo quando o banco preserva bits de host no CIDR. Uma regra para uma rede maior também bloqueia o laboratório; um comentário com ID antigo não oculta seu efeito. Uma regra sem o salto de `FORWARD` não bloqueia esse fluxo. A interface de saída precisa corresponder a `SSH_WAN_INTERFACE`.

Políticas/regras não reconhecidas, bloqueios parciais, saída incompleta e falhas SSH retornam estado desconhecido. A presença do salto exige que a chain seja retornada, evitando interpretar uma falha ao consultá-la como liberação. Não se trata de uma simulação geral de todas as tabelas do iptables nem de um teste de conectividade, DNS ou NAT. Nenhuma consulta altera regras, contadores ou status no banco.

O endpoint e seus campos estão documentados na [README](../README.md#verificação-de-consistência-do-firewall).

## Reconciliação manual

`POST /api/labs/:id/firewall-reconcile` reutiliza exclusivamente as três operações existentes: `status`, `block` e `unblock`. Nenhuma alteração do executor ou do sudoers é necessária. A política e a sub-rede vêm do laboratório persistido, sem argumentos fornecidos pelo cliente.

O fluxo consulta `status`; se houver divergência conhecida, executa uma única alteração para aquele subnet, interface e comentário `labguard:<id>`, seguida de uma nova consulta `status`. Se o bloqueio observado vier de uma regra mais ampla, de outro ID ou de outra configuração que o executor não possa remover, a verificação final continua divergente e a API solicita intervenção, preservando essas regras.

Uma falha ou estado ambíguo na leitura inicial impede alterações. Falhas após o envio do comando não são tratadas como liberação nem como sincronização confirmada. A ação é sempre manual; detalhes do contrato e dos locks estão na [README](../README.md#reconciliação-manual-do-firewall).
