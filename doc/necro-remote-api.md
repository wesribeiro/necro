# NECRO — API de Comunicação Remota (WebSocket)

Documentação da interface de comunicação entre o **NECRO** (agent instalado nas máquinas) e o **Painel Central** a ser desenvolvido.

---

## Protocolo

| Campo        | Valor                         |
|-------------|-------------------------------|
| Protocolo    | WebSocket (`ws://`)           |
| Porta padrão | `9999` (configurável por máquina) |
| Autenticação | Nenhuma (rede interna — v1.0) |
| Encoding     | JSON (UTF-8)                  |

**Endereço de acesso:**
```
ws://<IP_DA_MÁQUINA>:<PORTA>
```
Exemplo: `ws://192.168.1.100:9999`

---

## Mensagens Enviadas pelo NECRO (Server → Client)

### `status` — Status atual (enviado ao conectar)
```json
{
  "type": "status",
  "status": "Em execução",
  "processName": "CISSFront.exe",
  "lastStart": "08:34:22",
  "server": "SRV-PDV-01",
  "ts": "2026-03-18T15:30:00.000Z"
}
```

### `heartbeat` — Pulso a cada 30 segundos
```json
{
  "type": "heartbeat",
  "status": "Em execução",
  "processName": "CISSFront.exe",
  "lastStart": "08:34:22",
  "server": "SRV-PDV-01",
  "ts": "2026-03-18T15:30:30.000Z"
}
```

### `log` — Novo evento de log
```json
{
  "type": "log",
  "time": "15:30:00",
  "date": "2026-03-18",
  "message": "► NECRO SRV-PDV-01 iniciado | monitorando CISSFront.exe",
  "ts": "2026-03-18T15:30:00.000Z"
}
```

### `ack` — Confirmação de comando recebido
```json
{
  "type": "ack",
  "command": "restart",
  "ts": "2026-03-18T15:31:00.000Z"
}
```

### `pong` — Resposta ao ping
```json
{
  "type": "pong",
  "ts": "2026-03-18T15:31:05.000Z"
}
```

### `error` — Comando desconhecido
```json
{
  "type": "error",
  "message": "Comando desconhecido: foobar",
  "ts": "2026-03-18T15:31:10.000Z"
}
```

---

## Comandos Aceitos pelo NECRO (Client → Server)

| `command`    | Ação                                           |
|-------------|------------------------------------------------|
| `getStatus` | Retorna o status atual imediatamente            |
| `pause`     | Pausa o monitoramento                          |
| `resume`    | Retoma o monitoramento                         |
| `restart`   | Executa restart manual (mesmo caminho da UI)   |
| `kill`      | Encerra o processo monitorado e pausa o monitor|
| `ping`      | Verifica conectividade; retorna `pong`         |

**Formato do comando:**
```json
{ "command": "restart" }
```

---

## Valores de Status

| Valor          | Significado                              |
|---------------|------------------------------------------|
| `Em execução` | Processo monitorado está rodando         |
| `Parado`      | Processo não encontrado                  |
| `Recuperando` | Tentando reiniciar automaticamente       |
| `Reiniciando` | Restart manual ou agendado em progresso  |
| `Pausado`     | Monitoramento pausado pelo usuário       |

---

## Sugestão de Arquitetura do Painel Central

```
Painel Central (Node.js / Electron / Web)
│
├── Lista de máquinas configuradas (IP + Porta + Nome)
│   ├── SRV-PDV-01 → ws://192.168.1.100:9999
│   ├── SRV-PDV-02 → ws://192.168.1.101:9999
│   └── ...
│
├── Para cada máquina:
│   ├── Mantém conexão WebSocket persistente
│   ├── Reconecta automaticamente se desconectar
│   ├── Exibe lastHeartbeat para calcular "tempo sem resposta"
│   └── Envia comandos (restart, pause, etc.) remotamente
│
└── Dashboard:
    ├── Grid de cards por máquina (status, processName, server)
    ├── Feed de logs consolidado ou por máquina
    └── Alertas quando heartbeat parar (máquina offline)
```

---

## Testando com wscat

```bash
# Instalar
npm install -g wscat

# Conectar
wscat -c ws://192.168.1.100:9999

# Enviar comandos
> {"command":"getStatus"}
> {"command":"restart"}
> {"command":"ping"}
```

---

## Próximos Passos (v2.0)

- [ ] Autenticação por token simples (header `Authorization` no handshake)
- [ ] TLS/WSS para comunicação segura dentro da rede
- [ ] Histórico de logs persistido no painel central (centralizado)
- [ ] Notificações push (email/webhook) ao detectar falhas
