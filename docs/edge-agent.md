# Edge Agent Local

## Objetivo

O `edge-agent` e o servico que roda no site da escola e faz a ponte entre:

- a nuvem da plataforma
- os dispositivos Intelbras na rede local

Ele foi desenhado para operar no modelo `edge-first`, em que a nuvem coordena e o edge executa localmente.

## O que ele faz

- faz o `claim` do edge com token de provisionamento
- salva a credencial local do edge em disco
- envia `heartbeat` periodico da unidade
- verifica a saude dos dispositivos locais
- recebe `autoRegist/connect` dos devices Intelbras compativeis
- abre sessao `global/login` com digest auth
- mantem `global/keep-alive` recorrente com token de sessao
- busca jobs de sincronizacao na nuvem
- executa os jobs nos dispositivos Intelbras
- recebe eventos locais dos dispositivos e os envia para a nuvem
- mantem spool local de eventos quando a internet ou a API estao indisponiveis

## Modulo interno

O edge local agora trabalha com quatro blocos operacionais:

- `Cloud Bridge`: claim, heartbeat, licenciamento e sincronizacao com a nuvem
- `Device Executor`: executa comandos CGI nos devices Intelbras da rede local
- `AutoRegister Gateway`: recebe o registro automatico do device, autentica a sessao e envia keep-alive
- `Local Operations UI`: painel leve em `http://IP_DO_EDGE:4500/ui` para suporte e homologacao

## Estrutura

- codigo do agente: `edge-agent/`
- exemplo de configuracao: `edge-agent/config.example.json`
- estado local ignorado no Git: `edge-agent/state/`
- guia de instalacao: `docs/edge-installation.md`
- plano de confiabilidade: `docs/edge-reliability-test-plan.md`

## Configuracao inicial

Opcao mais rapida no Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\init-edge-agent-config.ps1 -BaseUrl http://localhost:4000
```

Isso cria `edge-agent/config.json` a partir do template e preenche o basico do laboratorio local.

1. Copie `edge-agent/config.example.json` para `edge-agent/config.json`.
2. Ajuste `cloud.baseUrl` para a URL da plataforma.
3. Cole em `cloud.enrollmentToken` o token gerado na tela `Edges`.
4. Cadastre os dispositivos locais no array `devices`.
5. Defina um `intakeSecret` para proteger a ingestao local de eventos.
6. Para devices compativeis com AutoRegister CGI, configure `transport: "hybrid"` ou `transport: "auto-register"`.
7. Ajuste `autoRegister.deviceId` para o mesmo valor que sera configurado no equipamento Intelbras.

## Scripts

- `npm run edge:doctor`
- `npm run edge:claim`
- `npm run edge:simulate-event`
- `npm run edge:run`
- `npm run dev:edge`
- `powershell -ExecutionPolicy Bypass -File .\scripts\init-edge-agent-config.ps1`

## Fluxo de uso

### 1. Validar configuracao

```bash
npm run edge:doctor
```

### 2. Fazer claim do edge

```bash
npm run edge:claim
```

Isso salva `edgeId` e `edgeKey` em `edge-agent/state/credentials.json`.

### 3. Subir o agente

```bash
npm run edge:run
```

Ao subir, o agente:

- abre o servidor local
- publica a interface de operacao em `/ui`
- passa a escutar `POST /cgi-bin/api/autoRegist/connect`
- envia heartbeat
- busca jobs pendentes
- comeca a drenar o spool de eventos

### 4. Homologar evento sem hardware final

Para validar a fila local e o envio para a nuvem mesmo sem Raspberry ou device fisico:

```bash
npm run edge:simulate-event -- --device-ref portao-principal --user-id TESTE123
```

Depois, voce pode:

- abrir `http://IP_DO_EDGE:4500/ui`
- usar o botao `Gerar evento de teste`
- executar `Enviar eventos`
- conferir na plataforma se o evento chegou

## AutoRegister CGI Intelbras

Para os modelos compativeis, o edge pode receber o registro automatico do equipamento.

Configure o device para apontar para:

```text
POST http://IP_DO_EDGE:4500/cgi-bin/api/autoRegist/connect
```

No device, o `DeviceID` deve bater com um dos identificadores abaixo:

- `devices[].autoRegister.deviceId`
- `devices[].localIdentifier`
- `devices[].serialNumber`
- `devices[].cloudDeviceId`

Quando o `connect` chega, o edge:

1. identifica o device no `config.json`
2. inicia `POST /cgi-bin/api/global/login` com digest auth
3. guarda o `Token` da sessao
4. envia `POST /cgi-bin/api/global/keep-alive` a cada 20 segundos
5. mostra o estado dessa sessao na UI local

## Endpoint local para Intelbras

Configure o dispositivo para apontar o push de eventos para:

```text
POST http://IP_DO_EDGE:4500/local/intelbras/events/portao-principal
Header: x-edge-intake-secret: <segredo-local>
```

O trecho final da URL deve bater com algum identificador do device no `config.json`, como:

- `cloudDeviceId`
- `serialNumber`
- `localIdentifier`
- `ipAddress`

## Operacao em campo sem Raspberry

Enquanto a Raspberry nao estiver disponivel, o modulo pode rodar em:

- notebook Windows
- notebook Linux
- mini PC
- VM local no site

O importante e manter:

- acesso a rede dos devices
- saida HTTPS 443 para a nuvem
- porta local do edge acessivel para `autoRegist/connect` e para a UI

Quando a Raspberry chegar, basta mover o `config.json`, reprovisionar se necessario e subir o mesmo agente como servico.

## Homologacao guiada na UI local

Na UI local do edge agora e possivel:

- fazer claim com o token gerado na nuvem
- verificar licenca e heartbeat
- consultar sessoes AutoRegister
- gerar evento de teste local para validar o fluxo ponta a ponta

## Observacoes operacionais

- as credenciais dos dispositivos ficam locais no edge
- a nuvem nao precisa guardar a senha do dispositivo em modo edge
- se a internet cair, os eventos ficam no spool local e sobem depois
- se um job falhar, o agente devolve o resultado para a nuvem

## Limitacoes desta versao

- suporte implementado para Intelbras
- spool local simples em JSON, nao SQLite
- sem rotacao automatica de `edgeKey`
- sem instalador/servico de sistema operacional ainda

## Proximos passos recomendados

- trocar spool JSON por SQLite
- adicionar criptografia local para credenciais dos dispositivos
- empacotar como servico Windows/Linux
- adicionar suporte a outros fabricantes
