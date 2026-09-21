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

O backend chama apenas `/usr/local/sbin/labguard-firewall block|unblock <subnet> <labId> <wan-interface>`. Fixe `SSH_HOST_FINGERPRINT` no formato `SHA256:<base64>` da chave pública do host. Persista as regras após reboot com `iptables-persistent`/`netfilter-persistent` ou um serviço systemd que restaure `iptables-save`.
