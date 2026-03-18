# NECRO — Núcleo de Execução, Controle e Recuperação de Operações

> Documentação completa do projeto. Este arquivo é a fonte de verdade que orienta todo o desenvolvimento da aplicação.

---

## Índice

1. [Contexto e Problema](#1-contexto-e-problema)
2. [Objetivo da solução](#2-objetivo-da-solução)
3. [Proposta da Aplicação](#3-proposta-da-aplicação)
4. [Funcionamento Geral](#4-funcionamento-geral)
5. [Interface da Aplicação](#5-interface-da-aplicação)
6. [Controles Manuais](#6-controles-manuais)
7. [Reinicializações Programadas](#7-reinicializações-programadas)
8. [Registro de Eventos (Log)](#8-registro-de-eventos-log)
9. [Inicialização Automática](#9-inicialização-automática)
10. [Benefícios Operacionais](#10-benefícios-operacionais)
11. [Evolução Futura](#11-evolução-futura)
12. [Stack Tecnológica](#12-stack-tecnológica)
13. [Arquitetura da Aplicação](#13-arquitetura-da-aplicação)
14. [Estrutura do Projeto](#14-estrutura-do-projeto)
15. [Comunicação Interna (IPC)](#15-comunicação-interna-ipc)
16. [Executor de Operações](#16-executor-de-operações)
17. [Automação PowerShell](#17-automação-powershell)
18. [Sistema de Logs](#18-sistema-de-logs)
19. [Gerenciamento de Estado da Interface](#19-gerenciamento-de-estado-da-interface)
20. [Tratamento de Erros](#20-tratamento-de-erros)
21. [Segurança Operacional](#21-segurança-operacional)
22. [Build e Distribuição](#22-build-e-distribuição)
23. [Requisitos do Sistema](#23-requisitos-do-sistema)
24. [Fluxo Completo de Execução](#24-fluxo-completo-de-execução)
25. [Exemplo de Log Real](#25-exemplo-de-log-real)

---

## 1. Contexto e Problema

Em ambientes corporativos — especialmente no varejo — diversos processos dependem de aplicações específicas funcionando continuamente. Sistemas responsáveis por registrar vendas, integrar pagamentos, comunicar-se com serviços fiscais ou atualizar dados operacionais precisam permanecer ativos o tempo todo.

Na prática, aplicações em servidores Windows podem ser encerradas por diferentes motivos:

- Falhas internas do software
- Conflitos de sistema operacional
- Travamentos silenciosos
- Intervenções humanas acidentais
- Atualizações do Windows
- Falhas momentâneas de infraestrutura

Quando isso ocorre, muitas vezes o problema **não é percebido imediatamente**. O efeito aparece apenas quando outro sistema depende daquele serviço e falha.

No varejo, esse cenário se manifesta de forma crítica: as vendas deixam de ser processadas ou registradas corretamente. O resultado direto pode incluir:

- Atraso no processamento de vendas
- Filas e lentidão no atendimento ao cliente
- Necessidade de intervenção manual da equipe de TI
- Risco de perda de dados operacionais
- Impacto direto na experiência do cliente e na operação da loja

**O problema real não é a complexidade da solução — é o tempo até descobrir que algo parou.**

---

## 2. Objetivo da Solução

O objetivo desta aplicação é criar um mecanismo automático de **supervisão e recuperação de aplicações críticas**.

A ferramenta atuará como um vigia permanente dentro do servidor, responsável por:

- Monitorar continuamente uma aplicação específica
- Detectar quando ela não estiver em execução
- Executar automaticamente um processo de recuperação
- Registrar todas as ações realizadas em um histórico de eventos
- Permitir controle manual da equipe de TI

Em termos simples, o NECRO funciona como um **guardião da aplicação**. Sempre que a aplicação monitorada parar de funcionar, o sistema tentará restaurá-la automaticamente antes que o problema seja percebido pela operação.

---

## 3. Proposta da Aplicação

A aplicação será um pequeno sistema executado diretamente no servidor responsável pela aplicação monitorada.

Seu funcionamento se baseia em **três pilares**:

| Pilar | Descrição |
|---|---|
| **Monitoramento contínuo** | Verificação periódica se o processo monitorado está ativo |
| **Recuperação automática** | Caso o processo não esteja em execução, um protocolo automático de recuperação é acionado |
| **Registro e transparência** | Todas as ações são registradas em um log visual, rastreável pela equipe técnica |

---

## 4. Funcionamento Geral

O sistema executará verificações periódicas para confirmar se o processo monitorado está ativo no Windows.

```
Estado normal:
  Verificação → Processo ativo → Nenhuma ação

Estado de falha:
  Verificação → Processo não encontrado → Protocolo de recuperação
```

### Protocolo de recuperação automática

1. Tentativa de reiniciar a aplicação
2. Aguardar alguns segundos para permitir a inicialização
3. Verificar novamente se o processo está ativo
4. Repetir o procedimento caso necessário (até o limite de tentativas)
5. Se após várias tentativas a aplicação não iniciar, emitir alerta para a equipe responsável

---

## 5. Interface da Aplicação

A interface foi projetada para ser **simples, objetiva e legível de relance**, no estilo de um terminal ou painel de controle industrial. O objetivo é que a equipe de TI visualize rapidamente o estado atual do servidor sem necessidade de interpretar telas complexas.

### Referência visual

A interface segue exatamente o modelo definido no arquivo `doc/interface.png`.

### Características da janela

- **Frameless** — janela sem bordas nativas do Windows
- **Barra de controle customizada** no topo, com três botões circulares coloridos:
  - 🟡 **Amarelo** — minimizar
  - 🟢 **Verde** — restaurar/maximizar
  - 🔴 **Vermelho** — fechar

### Painel de Status

Painel destacado (fundo verde quando processo está ativo, vermelho quando parado, cinza quando monitoramento pausado) que exibe:

```
PROCESSO: monitor.exe
STATUS: RUNNING
ÚLTIMO RESTART: 18:33:17
```

| Campo | Descrição |
|---|---|
| `PROCESSO` | Nome do executável monitorado |
| `STATUS` | Estado atual do processo |
| `ÚLTIMO RESTART` | Horário do último reinício registrado |

#### Estados possíveis do STATUS

| Status | Cor do painel | Significado |
|---|---|---|
| `RUNNING` | Verde | Processo em execução, tudo normal |
| `NOT FOUND` | Vermelho | Processo não encontrado, recuperação em andamento |
| `RESTARTING` | Laranja/Amarelo | Reinicialização em andamento |
| `PAUSED` | Cinza | Monitoramento pausado manualmente |

### Botões de Controle

Três botões posicionados abaixo do painel de status:

| Botão | Cor | Ação |
|---|---|---|
| **PAUSAR** | Amarelo | Pausa o monitoramento automático |
| **RESTART** | Laranja | Força reinicialização imediata da aplicação monitorada |
| **ENCERRAR** | Vermelho | Encerra o processo monitorado sem recuperação automática |

### Feed de Log (Terminal)

Área de rolagem com fundo escuro (cinza-escuro / tom de terminal) que exibe o histórico de eventos em tempo real, no formato:

```
HH:MM:SS -- [mensagem do evento]
```

Fonte monoespaçada (estilo terminal). Os logs mais recentes devem ser exibidos no topo ou o scroll deve ir automaticamente para o final da lista.

---

## 6. Controles Manuais

Embora o sistema opere de forma automática, a equipe técnica poderá interagir com ele. As ações disponíveis:

### Pausar o Monitoramento
- Interrompe temporariamente as verificações automáticas
- Útil durante manutenções ou intervenções planejadas
- O processo monitorado continua rodando; apenas a supervisão é interrompida
- Status muda para `PAUSED`

### Retomar o Monitoramento
- Reativa o processo automático de verificação e recuperação
- Disponível quando o monitoramento está pausado

### Reiniciar a Aplicação (RESTART)
- Encerra o processo atual e executa novamente a aplicação monitorada
- Passa pelo fluxo completo de reinicialização com verificação de status
- Aguarda 30 segundos antes de verificar se subiu corretamente

### Encerrar a Aplicação (ENCERRAR)
- Finaliza o processo monitorado
- **Não** inicia automaticamente a recuperação — encerramento intencional
- A equipe pode retomar o monitoramento depois manualmente

---

## 7. Reinicializações Programadas

Além da recuperação automática em caso de falha, o sistema suporta reinicializações programadas — útil para aplicações que se beneficiam de reinicializações periódicas para evitar acúmulo de recursos ou comportamentos instáveis.

### Modalidade 1 — Horário Fixo

Reinicialização automática todos os dias em um horário específico definido nas configurações.

```json
{
  "scheduledRestart": {
    "type": "fixed",
    "time": "06:00"
  }
}
```

**Exemplo:** Reiniciar o sistema todos os dias às 06:00.

### Modalidade 2 — Intervalo de Tempo

Reinicialização automática após um intervalo definido desde o último início.

```json
{
  "scheduledRestart": {
    "type": "interval",
    "intervalHours": 3
  }
}
```

**Exemplo:** Reiniciar a aplicação a cada 3 horas.

> **Regra de conflito:** O sistema considera o horário do último reinício para evitar conflitos entre regras de agendamento. Se o processo acabou de ser reiniciado por falha, o timer de intervalo é reiniciado.

---

## 8. Registro de Eventos (Log)

Todos os eventos relevantes são registrados pelo sistema. Esses registros permitem compreender o comportamento da aplicação monitorada ao longo do tempo.

### Eventos registrados

| Evento | Descrição |
|---|---|
| Monitor iniciado | NECRO iniciou o monitoramento |
| Processo monitorado | Confirmação do processo alvo |
| Restart agendado | Reinício por horário fixo ou intervalo |
| Processo não encontrado | Falha detectada |
| Iniciando recuperação | Protocolo automático acionado |
| Tentativa start #N | Cada tentativa de reinicialização |
| Verificando processo | Checagem de status pós-reinício |
| Recuperação concluída | Processo voltou a funcionar |
| Comando manual: kill | Encerramento manual pelo usuário |
| Comando manual: restart | Reinício manual pelo usuário |
| Monitor pausado | Supervisão interrompida manualmente |
| Monitor retomado | Supervisão reativada |

### Formato do log

```
HH:MM:SS -- [descrição do evento]
```

### Armazenamento

- **Em arquivo:** `/logs/necro.log`
- **Na interface:** Feed visual em tempo real
- **Rotação futura:** `winston-daily-rotate-file`

---

## 9. Inicialização Automática

A aplicação será configurada para iniciar automaticamente junto com o sistema operacional (via Startup do Windows ou Tarefa Agendada).

Isso garante que:
- O monitoramento esteja ativo mesmo após reinicializações do servidor
- O sistema opere normalmente com a tela bloqueada
- Não seja necessária intervenção humana para ativar o NECRO após queda de energia

---

## 10. Benefícios Operacionais

| Benefício | Descrição |
|---|---|
| Redução de interrupções | Aplicações que parem inesperadamente são restauradas automaticamente |
| Menor tempo de resposta da TI | Muitos incidentes são resolvidos antes de serem percebidos |
| Estabilidade operacional | Processos críticos ganham camada adicional de segurança |
| Visibilidade de comportamento | Logs permitem entender quando e por que falhas ocorrem |

---

## 11. Evolução Futura

A arquitetura deve permitir que múltiplos servidores enviem informações para um **painel centralizado de monitoramento** no futuro.

Esse painel central poderá:
- Visualizar o status de todos os servidores em um único lugar
- Acompanhar eventos de toda a infraestrutura
- Identificar rapidamente servidores com problemas
- Gerar alertas centralizados

> A primeira versão opera de forma **local** em cada servidor. O design, porém, deve permitir essa expansão futura sem reestruturação completa — particularmente via uma API de relatório de status que pode ser ativada quando necessário.

---

## 12. Stack Tecnológica

| Camada | Tecnologia | Finalidade |
|---|---|---|
| Runtime | **Node.js** | Execução da lógica central e interação com o SO |
| Interface Desktop | **Electron** | Empacotamento como aplicação desktop Windows |
| Execução de comandos | **child_process** | Módulo nativo Node para spawnar processos |
| Automação Windows | **PowerShell** | Controle de serviços, processos e rotinas administrativas |
| Logs | **Winston** | Registro estruturado de eventos |
| Interface | **HTML5 / CSS3 / JavaScript** | Renderização dentro do Electron |
| Empacotamento | **Electron Builder** | Geração do instalador `NECRO Setup.exe` |

> **Princípio de engenharia:** O Electron é apenas o cockpit. O poder real do NECRO está no Node controlando o sistema operacional. Essa separação deve ser sempre respeitada para manter o projeto limpo e previsível.

---

## 13. Arquitetura da Aplicação

O NECRO segue o modelo arquitetural do Electron com separação estrita de responsabilidades:

```
┌─────────────────────────────────┐
│         Renderer (UI)           │  HTML / CSS / JavaScript
│   interface, exibição, botões   │
└──────────────┬──────────────────┘
               │ IPC (ipcRenderer.invoke)
               ▼
┌─────────────────────────────────┐
│      Main Process (Node.js)     │  Orquestração
│  main.js · ipc.js · executor.js │
└──────────────┬──────────────────┘
               │ child_process / PowerShell
               ▼
┌─────────────────────────────────┐
│     Sistema Operacional         │  Windows
│   processos · serviços · FS     │
└─────────────────────────────────┘
```

### Responsabilidades por camada

| Camada | Responsabilidade |
|---|---|
| **Renderer** | Interface e interação do usuário. Nunca executa código sensível diretamente |
| **Main Process** | Orquestração de operações, IPC, ciclo de vida, logs |
| **Services** | Execução real das tarefas (PowerShell, processos) |
| **Sistema** | Execução no Windows |

---

## 14. Estrutura do Projeto

```
necro/
│
├─ main/
│   ├─ main.js           # Entrada principal do Electron
│   ├─ ipc.js            # Registro e tratamento de canais IPC
│   └─ executor.js       # Execução de comandos via child_process
│
├─ renderer/
│   ├─ index.html        # HTML da interface
│   ├─ renderer.js       # Lógica da interface + IPC calls
│   └─ styles.css        # Estilos visuais (tema terminal/industrial)
│
├─ services/
│   ├─ monitor.js        # Loop de monitoramento e lógica de recuperação
│   ├─ scheduler.js      # Agendamento de reinicializações programadas
│   └─ powershellRunner.js  # Encapsulamento de execução PowerShell
│
├─ logs/
│   └─ logger.js         # Configuração do Winston
│
├─ config/
│   └─ config.json       # Configurações da aplicação
│
├─ scripts/
│   └─ *.ps1             # Scripts PowerShell de automação
│
├─ package.json
└─ electron-builder.json
```

### Descrição dos módulos principais

#### `main/main.js`
- Ponto de entrada da aplicação Electron
- Cria e configura a BrowserWindow (frameless, tamanho fixo)
- Inicializa o logger
- Registra canais IPC
- Inicia o loop de monitoramento

#### `main/ipc.js`
- Define todos os canais de comunicação entre Renderer e Main
- Canais disponíveis:
  - `monitor:pause` — pausa o monitoramento
  - `monitor:resume` — retoma o monitoramento
  - `monitor:restart` — força reinicialização manual
  - `monitor:kill` — encerra o processo monitorado
  - `monitor:status` — retorna status atual

#### `main/executor.js`
- Executa comandos no sistema operacional via `child_process.spawn()`
- Captura `stdout` e `stderr`
- Retorna resultado estruturado

#### `services/monitor.js`
- Loop de monitoramento com intervalo configurável
- Detecta se o processo está ativo via `tasklist`
- Aciona protocolo de recuperação quando necessário
- Gerencia número de tentativas e cooldown entre tentativas

#### `services/scheduler.js`
- Gerencia reinicializações programadas (horário fixo e intervalo)
- Integra com o monitor para coordenar reinicializações

#### `services/powershellRunner.js`
- Encapsula execução de scripts `.ps1`
- Padrão de execução: `powershell.exe -ExecutionPolicy Bypass -File script.ps1`

#### `logs/logger.js`
- Configuração do Winston com transports para arquivo e console
- Formato: `[LEVEL] mensagem`

---

## 15. Comunicação Interna (IPC)

O Electron utiliza Inter-Process Communication (IPC) para comunicação segura entre Renderer e Main Process.

### Envio de comando (Renderer → Main)

```javascript
const result = await ipcRenderer.invoke('monitor:restart');
```

### Payload de comando (exemplo)

```json
{
  "command": "restart",
  "source": "manual"
}
```

### Resposta padrão (Main → Renderer)

**Sucesso:**
```json
{
  "status": "success",
  "executionTime": 1432,
  "message": "Processo reiniciado com sucesso"
}
```

**Erro:**
```json
{
  "status": "error",
  "message": "Acesso negado — execute como administrador"
}
```

---

## 16. Executor de Operações

**Arquivo:** `main/executor.js`

Responsável por executar comandos no sistema operacional.

Utiliza `child_process.spawn()` — preferido em relação ao `exec()` por permitir **streaming de saída em tempo real**, ideal para exibição de logs na interface.

### Fluxo interno

```
Recebe comando
      ↓
Validação de segurança (lista branca)
      ↓
spawn() do processo
      ↓
Captura stdout (stream)
      ↓
Captura stderr (stream)
      ↓
Retorno do resultado estruturado
```

### Assinatura da função

```javascript
executeCommand(command, args, options)
```

**Exemplo:**
```javascript
spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', 'scripts/restart.ps1'])
```

---

## 17. Automação PowerShell

**Arquivo:** `services/powershellRunner.js`

O PowerShell oferece controle profundo do Windows, incluindo:
- Gerenciamento de processos
- Controle de serviços do Windows
- Manipulação de arquivos
- Consulta de eventos do sistema

### Padrão de execução

```
powershell.exe -ExecutionPolicy Bypass -File script.ps1
```

O Node.js orquestra as execuções; o PowerShell realiza as operações de SO.

### Scripts disponíveis (em `scripts/`)

| Script | Finalidade |
|---|---|
| `start-process.ps1` | Inicia o processo monitorado |
| `stop-process.ps1` | Encerra o processo monitorado |
| `check-process.ps1` | Verifica se o processo está ativo |
| `restart-process.ps1` | Reinicialização completa do processo |

---

## 18. Sistema de Logs

**Arquivo:** `logs/logger.js`  
**Biblioteca:** Winston

### Níveis de log

| Nível | Uso |
|---|---|
| `INFO` | Eventos normais do sistema |
| `WARN` | Situações que requerem atenção mas não são erros |
| `ERROR` | Falhas e problemas de execução |
| `DEBUG` | Informações detalhadas para desenvolvimento |

### Exemplos de log

```
[INFO] task.start restart_spooler
[INFO] task.success restart_spooler 842ms
[WARN] tentativa de reinício do processo falhou (1/3)
[ERROR] task.failure restart_spooler access denied
```

### Armazenamento

```
/logs/necro.log
```

Rotação futura via `winston-daily-rotate-file`.

---

## 19. Gerenciamento de Estado da Interface

A interface mantém um estado local simples, atualizado via eventos IPC:

```javascript
const state = {
  processName: 'monitor.exe',
  status: 'RUNNING',          // RUNNING | NOT FOUND | RESTARTING | PAUSED
  lastRestart: '18:33:17',
  logs: [],
  isMonitoring: true
}
```

### Quando o estado é atualizado

- Ao iniciar a aplicação (estado inicial)
- Quando o monitor detecta mudança de status do processo
- Após execução de comando manual
- Quando um novo evento de log é gerado

---

## 20. Tratamento de Erros

O NECRO classifica erros em três categorias:

### Erros de Execução
- **Causa:** Script retornou código diferente de 0
- **Tratamento:** Registrar `[ERROR]` no log; retornar erro ao Renderer; exibir na interface

### Erros de Permissão
- **Causa:** Access denied — processo exige privilégios elevados
- **Tratamento:** Registrar erro crítico; exibir mensagem sugerindo execução como administrador

### Erros Internos
- **Causa:** Falha no canal IPC ou no próprio NECRO
- **Tratamento:** Registrar `[ERROR]`; exibir alerta na interface; tentar recuperar o monitor

---

## 21. Segurança Operacional

Mesmo sendo uma ferramenta local, algumas medidas são essenciais:

### Validação de comandos (lista branca)
- A aplicação **não executa comandos arbitrários** vindos da interface
- Somente operações definidas em `config/config.json` podem ser executadas
- Isso evita command injection e execuções não intencionais

### Configuração de processos monitorados

```json
{
  "monitor": {
    "processName": "monitor.exe",
    "executablePath": "C:\\App\\monitor.exe",
    "checkIntervalSeconds": 30,
    "maxRetries": 3,
    "retryDelaySeconds": 10,
    "restartWaitSeconds": 30
  },
  "scheduledRestart": {
    "enabled": true,
    "type": "fixed",
    "time": "06:00"
  },
  "server": {
    "name": "SRV-PDV-01"
  }
}
```

### Parâmetros de configuração

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `processName` | string | Nome do executável monitorado |
| `executablePath` | string | Caminho completo para iniciar o processo |
| `checkIntervalSeconds` | number | Intervalo entre verificações de status |
| `maxRetries` | number | Máximo de tentativas de recuperação antes de alertar |
| `retryDelaySeconds` | number | Espera entre tentativas de recuperação |
| `restartWaitSeconds` | number | Tempo de espera após iniciar o processo antes de verificar |

---

## 22. Build e Distribuição

### Processo de build

```bash
npm install
npm run build
```

**Ferramenta:** Electron Builder  
**Artefato final:** `dist/NECRO Setup.exe`

O instalador inclui:
- Runtime Node.js
- Chromium (Electron)
- Aplicação NECRO completa
- Dependências

### `electron-builder.json` (configuração mínima esperada)

```json
{
  "appId": "com.necro.monitor",
  "productName": "NECRO",
  "win": {
    "target": "nsis",
    "icon": "assets/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  }
}
```

---

## 23. Requisitos do Sistema

| Requisito | Especificação |
|---|---|
| Sistema Operacional | Windows 10 ou superior |
| RAM mínima | 4 GB |
| Armazenamento | 200 MB |
| Permissões | Execução de scripts PowerShell habilitada |
| Inicialização | Recomendado executar como Administrador para rotinas elevadas |

---

## 24. Fluxo Completo de Execução

### Fluxo de inicialização do NECRO

```
Electron inicia
      ↓
main.js executado
      ↓
Logger configurado
      ↓
config.json carregado
      ↓
Canais IPC registrados
      ↓
Janela principal criada (frameless)
      ↓
Interface carregada
      ↓
Loop de monitoramento iniciado
```

### Fluxo de recuperação automática

```
[Verificação periódica]
      ↓
Processo encontrado? → SIM → aguarda próxima verificação
      ↓ NÃO
[INFO] Processo não encontrado
      ↓
[INFO] Iniciando recuperação
      ↓
Tentativa #1 — spawn processo
      ↓
Aguarda restartWaitSeconds
      ↓
Verificação: processo ativo? → SIM → [INFO] Recuperação concluída
      ↓ NÃO
Tentativa #2...
      ↓
(Até maxRetries)
      ↓ Todas falharam
[ERROR] Falha na recuperação — alerta emitido
```

### Fluxo de comando manual (RESTART)

```
Usuário clica RESTART
      ↓
Renderer envia IPC: monitor:restart
      ↓
Main recebe → valida comando
      ↓
executor.js: taskkill /IM processo.exe
      ↓
[INFO] Processo encerrado
      ↓
Aguarda 30s
      ↓
executor.js: spawn processo
      ↓
Aguarda restartWaitSeconds
      ↓
Verificação de status
      ↓
[INFO] Restart manual concluído
      ↓
Renderer atualiza interface
```

---

## 25. Exemplo de Log Real

O exemplo abaixo ilustra um dia típico de operação do NECRO, com restart agendado, falha e recuperação automática, e intervenções manuais:

```
05:58:12 -- Monitor iniciado (SRV-PDV-01)
05:58:12 -- Processo monitorado: monitor.exe
06:00:00 -- Restart agendado iniciado
06:00:00 -- Encerrando monitor.exe
06:00:03 -- Processo encerrado
06:00:03 -- Iniciando monitor.exe
06:00:13 -- Verificação de status
06:00:13 -- Processo ativo
06:00:13 -- Restart concluído
07:42:51 -- Processo não encontrado
07:42:51 -- Iniciando recuperação
07:42:51 -- Tentativa start #1
07:43:01 -- Verificando processo
07:43:01 -- Processo não iniciou
07:43:01 -- Tentativa start #2
07:43:11 -- Verificando processo
07:43:11 -- Processo ativo
07:43:11 -- Recuperação concluída
10:12:33 -- Comando manual: kill
10:12:33 -- Encerrando monitor.exe
10:12:36 -- Processo encerrado
10:12:45 -- Comando manual: restart
10:12:45 -- Restart manual iniciado
10:12:45 -- Encerrando monitor.exe
10:12:48 -- Processo encerrado
10:12:48 -- Aguardando 30s
10:13:18 -- Iniciando monitor.exe
10:13:28 -- Verificando processo
10:13:28 -- Processo ativo
10:13:28 -- Restart manual concluído
11:05:02 -- Monitor pausado
11:22:47 -- Monitor retomado
```

---

## Princípios de Engenharia

> O Electron é apenas o cockpit. O motor real do NECRO é o Node controlando o sistema operacional. Quando essa separação é respeitada, o projeto continua limpo, previsível e fácil de evoluir.

> Sistemas assim — pequenos orquestradores locais — acabam desempenhando um papel parecido com sistemas nervosos autônomos. Quando bem projetados, ninguém percebe sua existência — exceto no raro momento em que evitam um desastre operacional.

> Quando um sistema começa a executar operações administrativas reais no sistema operacional, a documentação deixa de ser apenas explicativa e passa a ser **contrato técnico**. Cada módulo precisa ter responsabilidade clara, pontos de falha conhecidos e comportamento previsível.

---

*Documentação NECRO — atualizada em 08/03/2026*