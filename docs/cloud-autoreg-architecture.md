# Cloud-Only AutoRegister Architecture

## Objetivo

Permitir operacao robusta sem edge local para dispositivos Intelbras compativeis com AutoRegister CGI, mantendo o edge local como opcao premium de resiliencia e autonomia.

O desenho precisa suportar:

- varios integradores
- varias escolas por integrador
- redes locais repetidas entre escolas
- dispositivos com mesmo IP privado em ambientes diferentes
- operacao multi-replica no backend principal

## Metodos de conexao suportados

A plataforma passa a trabalhar com tres caminhos de comunicacao:

1. `edge_only`
   - appliance local faz a conversa com o dispositivo
   - melhor opcao para ambientes com baixa qualidade de internet e operacao critica local

2. `direct_only`
   - nuvem acessa o dispositivo por rota privada controlada
   - indicado quando existe VPN, MPLS ou conectividade privada confiavel

3. `cloud_autoreg_only`
   - o proprio dispositivo abre o tunel para a nuvem via AutoRegister CGI
   - melhor opcao sem edge local quando o firmware Intelbras suportar o recurso

4. `auto`
   - prioriza edge quando houver edge associado
   - sem edge, usa AutoRegister CGI se existir sessao ativa
   - se nao houver tunel CGI, tenta a rota direta

## Problema que existia

Antes desta etapa, o fluxo sem edge existia, mas a sessao AutoRegister ficava presa no processo local da API.

Isso gerava quatro riscos:

- a API principal com varias replicas nao compartilhava o estado real do tunel
- o gateway CGI nao estava separado do backend transacional
- o diagnostico e o sync cloud-only dependiam de memoria local do processo
- o `DeviceID` do AutoRegister podia colidir quando dois devices usavam o mesmo identificador local

## Arquitetura nova

### 1. Gateway AutoRegister dedicado

Foi introduzido um servico dedicado `autoreg-gateway`.

Responsabilidades:

- receber `POST /cgi-bin/api/autoRegist/connect`
- autenticar o device via digest no socket reverso
- manter keep-alive a cada 20 segundos
- responder requisicoes CGI para o backend principal

Isso desacopla o tunel cloud-only da API de negocio.

### 2. Presenca distribuida via Redis

Cada sessao ativa e publicada no Redis com TTL.

Campos principais:

- `deviceId`
- `deviceDbId`
- `gatewayInstanceId`
- `gatewayHostname`
- `status`
- `tokenReady`
- `connectedAt`
- `lastSeenAt`

Beneficios:

- qualquer replica da API consegue saber se o device esta com tunel ativo
- a resolucao de transporte deixa de depender apenas da memoria local
- dashboards e diagnosticos ficam coerentes em ambiente distribuido

### 3. Gateway interno entre API/worker e o tunel

Foi criado o endpoint interno:

- `/api/internal/autoreg/devices/:deviceId/request`

Ele e protegido por `AUTOREG_INTERNAL_TOKEN`.

Uso:

- a API principal chama o gateway para executar CGI
- o worker de sincronizacao tambem chama o gateway
- o tunel nao precisa morar dentro do mesmo processo que executa a regra de negocio

### 4. Identidade reversa segura do device

O identificador reverso agora segue esta regra:

- usar `device.id` da plataforma sempre que possivel
- usar `localIdentifier` apenas quando ele for unico
- rejeitar AutoRegister com `localIdentifier` ambiguo

Isso evita o problema classico de escolas diferentes com a mesma faixa `192.168.1.x`.

## Fluxo operacional sem edge local

### Cadastro

1. Operador cadastra o dispositivo na plataforma.
2. A plataforma gera ou reaproveita o `reverseIdentifier`.
3. A tela de dispositivos mostra:
   - `DeviceID` que deve ser configurado no equipamento
   - endpoint publico do AutoRegister
   - status atual do tunel CGI

### Conexao

1. O equipamento Intelbras envia `POST /cgi-bin/api/autoRegist/connect` para a nuvem.
2. O `autoreg-gateway` valida o `DeviceID`.
3. O gateway autentica no dispositivo via digest.
4. O gateway guarda a sessao localmente e publica a presenca no Redis.
5. O backend principal passa a enxergar o device como elegivel para `cloud_autoreg`.

### Operacao

1. Usuario dispara sync, ping ou consulta.
2. A API resolve o melhor transporte.
3. Se o transporte for `cloud_autoreg`, a API chama o endpoint interno do gateway.
4. O gateway escreve a requisicao CGI no socket reverso.
5. O dispositivo responde no mesmo tunel.
6. A API recebe o resultado sem precisar conhecer IP privado da escola.

## Como isso escala

### Multitenancy

O isolamento nao depende de IP local.

Ele depende de:

- tenancy no banco
- `device.id` unico na plataforma
- validacao do `DeviceID` no gateway
- autorizacao de usuario nas rotas da API

### Varios integradores e varias escolas

Cada escola pode repetir:

- IP local
- faixa de rede
- nome do gateway

Sem colidir na nuvem, porque o identificador real do tunel e o `reverseIdentifier`.

### Multi-replica

O backend principal pode continuar escalando horizontalmente.

O tunel AutoRegister fica concentrado no `autoreg-gateway`, enquanto a visibilidade da sessao fica distribuida no Redis.

## Quando usar cada caminho

### Melhor opcao geral

- usar `auto`

### Quando nao existe edge e o modelo suporta Intelbras AutoRegister

- usar `cloud_autoreg_only`

### Quando existe rota privada confiavel

- usar `direct_only`

### Quando a escola precisa operar mesmo com internet ruim ou manutencao da nuvem

- usar `edge_only`

## O que foi implementado nesta etapa

- gateway AutoRegister dedicado no deploy
- presenca distribuida de sessao no Redis
- proxy interno entre API/worker e gateway
- rejeicao de `DeviceID` ambiguo
- exibir `DeviceID` reverso e status do tunel na UI de dispositivos
- ativacao correta do worker de sync direto no modo sem edge

## O que ainda fica para a proxima onda

- autenticar `AUTOREG_INTERNAL_TOKEN` via secret gerenciado em vez de valor em env
- adicionar metricas Prometheus para:
  - sessoes ativas
  - keep-alive falho
  - latencia media por CGI
  - falhas por modelo e firmware
- implementar smoke test automatizado do gateway
- adicionar painel operacional especifico para sessoes AutoRegister
- avaliar segunda replica do gateway com estrategia de ownership consistente

## Recomendacao de produto

Para competir bem sem edge local:

- usar `cloud_autoreg_only` como caminho principal para Intelbras compativel
- manter `edge_only` como diferencial de resiliencia e autonomia local
- tratar `direct_only` como caminho complementar para clientes com rede privada madura

Assim a plataforma cobre os tres cenarios de mercado sem obrigar edge em toda venda.
