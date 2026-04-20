# Evolution WhatsApp Multi-Escola

## Objetivo

Definir um modelo confiavel e multitenant para que:

- cada escola tenha o seu proprio numero de WhatsApp;
- cada escola tenha a sua propria instancia na Evolution API;
- cada integrador enxergue apenas as escolas do seu tenant;
- cada escola consiga ler o seu QR Code de conexao de forma isolada;
- o envio de notificacoes use sempre a instancia correta da escola do evento.

## Diagnostico do estado atual

Hoje o projeto **nao trabalha com 1 instancia por escola**.

O envio usa uma configuracao global:

- `EVOLUTION_API_URL` com fallback para `http://evolution-api:8080`
- `EVOLUTION_API_TOKEN` global
- `EVOLUTION_INSTANCE` global com fallback para `school_access`

Referencias:

- [notificationWorker.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/workers/notificationWorker.ts:8>)
- [notificationWorker.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/workers/notificationWorker.ts:53>)

Isso significa que, no estado atual:

- todas as escolas compartilham a mesma instancia logica de envio;
- nao existe isolamento real por escola;
- nao existe tela ou fluxo backend para criar uma instancia por escola;
- nao existe leitura de QR Code por escola no app;
- o `n8n` nao e o emissor principal do WhatsApp, apenas recebe o payload espelhado apos a tentativa de envio.

Referencia:

- [notificationWorker.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/workers/notificationWorker.ts:95>)

Ao mesmo tempo, o sistema **ja possui base multitenant suficiente** para sustentar o desenho correto:

- perfis carregam `integratorId` e `schoolId` no JWT;
- as rotas usam filtros por tenant;
- os eventos ja pertencem a uma escola;
- o vinculo `aluno -> responsavel` ja esta pronto.

Referencias:

- [auth.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/routes/auth.ts:15>)
- [auth.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/routes/auth.ts:47>)
- [schema.prisma](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/prisma/schema.prisma:104>)
- [schema.prisma](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/prisma/schema.prisma:231>)
- [schema.prisma](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/prisma/schema.prisma:297>)
- [n8nTrigger.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/services/n8nTrigger.ts:16>)

## Fluxo atual de notificacao

Hoje o fluxo e este:

1. A Intelbras ou o edge envia o evento.
2. O sistema persiste o evento.
3. O sistema tenta descobrir o aluno pelo `deviceId + userIdRaw`.
4. Se achar `studentId`, carrega os responsaveis do aluno.
5. Cria `notification_jobs`.
6. Enfileira o job no BullMQ.
7. O worker envia via Evolution API usando uma unica instancia global.
8. Depois disso, espelha o payload para o `n8n`.

Referencias:

- [accessEventService.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/services/accessEventService.ts:42>)
- [intelbrasEventIngestion.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/services/intelbrasEventIngestion.ts:981>)
- [n8nTrigger.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/services/n8nTrigger.ts:42>)
- [notificationWorker.ts](<C:/Users/Master/Desktop/IA Cloud Acess/school-access-platform/api/workers/notificationWorker.ts:33>)

## Regra alvo recomendada

A regra correta para o produto e:

- **1 escola = 1 instancia Evolution = 1 numero de WhatsApp**

Consequencias diretas:

- uma escola A nunca usa o numero da escola B;
- um integrador com 10 escolas pode ter 10 instancias separadas;
- uma escola pode trocar de numero sem afetar outra;
- desconexao, bloqueio ou expiracao de uma instancia afeta apenas aquela escola;
- auditoria e suporte ficam muito mais claros.

## Modelo de isolamento recomendado

### Camada 1: isolamento por tenant

O integrador so enxerga escolas do proprio `integratorId`.

O `school_admin` so enxerga a propria `schoolId`.

O `superadmin` pode ver tudo.

Isso ja e compativel com a estrutura atual de autenticacao e tenancy.

### Camada 2: isolamento por instancia WhatsApp

Cada escola precisa ter um registro proprio de mensageria, com:

- `integratorId`
- `schoolId`
- `provider = evolution`
- `instanceName`
- `instanceToken` ou chave interna da instancia
- `phoneNumber`
- `ownerJid`
- `status`
- `lastQrAt`
- `lastConnectedAt`
- `lastDisconnectedAt`
- `webhookUrl`
- `webhookSecret`
- `isActive`

### Camada 3: isolamento de acesso

O recomendado **nao e dar acesso direto ao painel geral da Evolution** para cada escola.

O recomendado e:

- a escola acessa o modulo WhatsApp dentro do proprio app;
- o backend do app chama a Evolution em nome daquela escola;
- o backend entrega somente o QR Code e o status daquela instancia;
- nenhum usuario escolar recebe visao global de instancias.

Isso evita:

- vazamento de instancias entre tenants;
- acesso indevido a outros numeros;
- operacao manual fora de trilha de auditoria;
- uso de API key global fora do backend.

## Acesso recomendado a Evolution

### Modelo recomendado: acesso mediado pelo app

Fluxo de acesso:

1. O `superadmin` configura a conexao global com a Evolution.
2. O `integrator_admin` entra na escola desejada.
3. O `school_admin` ou `integrator_admin` abre a tela `WhatsApp da Escola`.
4. O backend verifica se a escola ja possui instancia.
5. Se nao possuir, o backend cria a instancia na Evolution.
6. O backend busca o QR Code da instancia.
7. A UI mostra o QR apenas para aquela escola.
8. A escola escaneia com o WhatsApp Business ou numero dedicado.
9. O backend consulta o estado de conexao ate ficar `open`.
10. O backend grava o numero conectado como emissor oficial daquela escola.

### Modelo nao recomendado: acesso direto ao manager geral da Evolution

Dar para cada escola o acesso direto ao manager global da Evolution aumenta muito o risco.

Riscos:

- ver outras instancias;
- excluir ou desconectar instancias de terceiros;
- vazar tokens;
- suporte mais dificil;
- auditoria incompleta.

Se existir exigencia contratual de acesso direto, o ideal seria um **proxy school-scoped**, nunca o painel global cru.

## Endpoints oficiais da Evolution relevantes

Com base na documentacao oficial:

- criar instancia: `POST /instance/create`
- gerar ou obter QR Code: `GET /instance/connect/{instance}`
- consultar estado da conexao: `GET /instance/connectionState/{instance}`
- enviar texto: `POST /message/sendText/{instance}`
- fazer logout da instancia: `DELETE /instance/logout/{instance}`
- consultar instancias e metadados: `GET /instance/fetchInstances`

Fontes oficiais:

- [Create Instance](https://doc.evolution-api.com/v2/api-reference/instance-controller/create-instance-basic)
- [Instance Connect](https://doc.evolution-api.com/v2/api-reference/instance-controller/instance-connect)
- [Connection State](https://doc.evolution-api.com/v2/api-reference/instance-controller/connection-state)
- [Send Plain Text](https://doc.evolution-api.com/v2/api-reference/message-controller/send-text)
- [Logout Instance](https://doc.evolution-api.com/v2/api-reference/instance-controller/logout-instance)
- [Fetch Instances](https://doc.evolution-api.com/v2/api-reference/instance-controller/fetch-instances)

## Desenho funcional recomendado

### 1. Cadastro da conexao WhatsApp por escola

Nova area no app:

- `Configuracoes > Canais > WhatsApp`

Campos:

- provedor: `Evolution API`
- servidor Evolution
- status da instancia
- nome da instancia
- numero conectado
- ultima conexao
- ultima leitura de QR
- modo de envio
- webhook ativo

Acoes:

- `Criar instancia`
- `Ler QR Code`
- `Atualizar status`
- `Desconectar numero`
- `Reconectar`
- `Trocar numero`
- `Desativar envio`

### 2. Convencao de nome da instancia

Padrao recomendado:

- `int_{integratorSlug}_sch_{schoolSlug}`

Exemplo:

- `int_techseg_sch_horizonte`
- `int_techseg_sch_lume`

Beneficios:

- legivel para suporte;
- unico globalmente;
- facil de auditar;
- facil de identificar a escola dono da instancia.

### 3. Ownership do numero

Ao concluir a conexao:

- o backend consulta a instancia;
- extrai o numero proprietario;
- grava no registro daquela escola;
- bloqueia reutilizacao do mesmo numero em outra escola, salvo processo explicito de migracao.

Regra recomendada:

- um numero nao pode ficar ativo em duas escolas ao mesmo tempo.

### 4. Envio por escola

O worker deve mudar a logica atual:

Estado atual:

- usa `EVOLUTION_INSTANCE` global

Estado recomendado:

1. receber `eventId`
2. resolver `event.schoolId`
3. carregar o canal WhatsApp ativo daquela escola
4. usar `instanceName` daquela escola
5. enviar para `POST /message/sendText/{instanceName}`
6. salvar `providerMessageId`, `instanceName` e status no job

## Estrutura de dados sugerida

Sugestao de nova modelagem:

### `SchoolMessagingChannel`

- `id`
- `integratorId`
- `schoolId`
- `provider`
- `instanceName`
- `instanceTokenEnc`
- `serverUrl`
- `phoneNumber`
- `ownerJid`
- `status`
- `connectionState`
- `lastQrCode`
- `lastQrGeneratedAt`
- `lastConnectedAt`
- `lastDisconnectedAt`
- `lastHealthcheckAt`
- `lastError`
- `isActive`
- `createdAt`
- `updatedAt`

Regras:

- `@@unique([schoolId, provider])`
- `instanceName` unico globalmente

### `SchoolMessagingAudit`

- `id`
- `schoolId`
- `integratorId`
- `channelId`
- `action`
- `actorProfileId`
- `metadata`
- `createdAt`

Eventos de auditoria:

- `instance_created`
- `qr_requested`
- `connected`
- `disconnected`
- `reconnected`
- `send_test_success`
- `send_test_failed`
- `number_changed`

### Ajuste em `NotificationJob`

Adicionar campos:

- `provider`
- `providerInstance`
- `providerMessageId`
- `schoolId`

## Perfis e permissoes

### `superadmin`

Pode:

- configurar servidor Evolution global;
- ver todas as instancias;
- desbloquear erro grave;
- migrar escola entre instancias;
- fazer auditoria global.

### `integrator_admin`

Pode:

- criar e gerenciar instancias das escolas do proprio integrador;
- visualizar QR Code das escolas do proprio integrador;
- desconectar e reconectar;
- disparar teste.

### `integrator_support`

Pode:

- visualizar status;
- visualizar QR Code;
- executar diagnostico;
- nao deve alterar credencial global sem permissao.

### `school_admin`

Pode:

- ver somente a propria escola;
- gerar QR Code da propria instancia;
- conectar e reconectar o numero da propria escola;
- testar envio da propria escola;
- nunca ver instancias de outras escolas.

### `coordinator` e `operator`

Nao devem gerir a integracao com Evolution.

Podem, no maximo:

- visualizar status resumido de envio;
- abrir chamado interno.

## Processo operacional recomendado

### Etapa 1: provisionamento da escola

1. Criar integrador.
2. Criar escola.
3. Criar `school_admin`.
4. Criar unidade e devices.
5. Validar licenca da escola e do integrador.
6. Habilitar modulo WhatsApp da escola.

### Etapa 2: criacao da instancia Evolution

1. Usuario autorizado entra na escola.
2. Clica em `Criar instancia`.
3. Backend monta `instanceName`.
4. Backend chama `POST /instance/create` com `qrcode: true`.
5. Backend grava retorno da instancia.

### Etapa 3: leitura do QR Code

1. UI chama backend do app.
2. Backend chama `GET /instance/connect/{instance}`.
3. Backend retorna `code` para a UI.
4. UI renderiza o QR Code.
5. Usuario escaneia com o WhatsApp da escola.

### Etapa 4: confirmacao de conexao

1. UI faz polling de status.
2. Backend chama `GET /instance/connectionState/{instance}`.
3. Quando estado for `open`, a UI mostra `Conectado`.
4. Backend atualiza `phoneNumber`, `ownerJid` e `lastConnectedAt`.

### Etapa 5: envio produtivo

1. O evento de acesso chega.
2. O sistema resolve o aluno.
3. O sistema resolve os responsaveis.
4. O worker identifica a escola do evento.
5. O worker carrega a instancia da escola.
6. O worker envia a mensagem por aquela instancia.
7. O job fica com trilha da escola, instancia e resultado.
8. O `n8n` recebe o payload enriquecido para automacoes paralelas.

## Endpoints internos recomendados no app

Sugestao de API interna:

- `GET /api/schools/:id/messaging/whatsapp`
- `POST /api/schools/:id/messaging/whatsapp/instance`
- `POST /api/schools/:id/messaging/whatsapp/qr`
- `GET /api/schools/:id/messaging/whatsapp/status`
- `POST /api/schools/:id/messaging/whatsapp/test-message`
- `POST /api/schools/:id/messaging/whatsapp/logout`
- `DELETE /api/schools/:id/messaging/whatsapp`

Regras:

- todas as rotas devem validar tenant;
- `integrator_admin` fica limitado ao proprio integrador;
- `school_admin` fica limitado ao proprio `schoolId`.

## Ajuste necessario no worker

O ponto tecnico mais importante da implementacao sera trocar isto:

- instancia global por `.env`

por isto:

- instancia resolvida por `event.schoolId`

Em termos praticos:

1. `triggerNotification` deve carregar tambem `schoolId`.
2. O payload da fila deve levar `schoolId`.
3. O worker deve buscar o canal ativo daquela escola.
4. O worker deve usar a `instanceName` daquela escola.
5. O log deve registrar qual instancia foi usada.

## UI/UX recomendada

### Tela da escola

Titulo:

- `WhatsApp da Escola`

Cards:

- `Status da conexao`
- `Numero conectado`
- `Ultimo envio`
- `Fila pendente`
- `Ultimo erro`

Bloco QR:

- botao `Gerar QR Code`
- area com QR
- contador de expiracao
- botao `Atualizar QR`

Bloco operacional:

- `Enviar mensagem de teste`
- `Desconectar numero`
- `Reconectar`
- `Ver logs`

### Tela do integrador

Tabela por escola:

- escola
- numero conectado
- instancia
- status
- ultimo evento
- ultimo erro
- acoes

Acoes:

- `Abrir escola`
- `Gerar QR`
- `Testar envio`
- `Ver logs`

### Tela do superadmin

Visao global:

- integrador
- escola
- instancia
- owner
- status
- fila
- erro recorrente

## Cenario de homologacao recomendado

### Cenario 1: isolamento entre duas escolas do mesmo integrador

Estrutura:

- Integrador: `TechSeg`
- Escola A: `Colegio Horizonte`
- Escola B: `Escola Lume`
- Instancia A: `int_techseg_sch_horizonte`
- Instancia B: `int_techseg_sch_lume`
- Numero A e Numero B distintos

Passos:

1. Conectar a Escola A com o Numero A.
2. Conectar a Escola B com o Numero B.
3. Criar aluno e responsavel na Escola A.
4. Criar aluno e responsavel na Escola B.
5. Vincular alunos aos devices corretos.
6. Disparar evento da Escola A.
7. Confirmar que a mensagem saiu pela instancia da Escola A.
8. Disparar evento da Escola B.
9. Confirmar que a mensagem saiu pela instancia da Escola B.

Aceite:

- nenhuma escola envia pelo numero da outra;
- nenhum usuario de uma escola consegue ver o QR da outra;
- o integrador ve ambas;
- o superadmin ve todas.

### Cenario 2: troca de numero da escola

Passos:

1. Escola A faz logout da instancia.
2. Sistema marca status `disconnected`.
3. Usuario gera novo QR.
4. Novo numero conecta.
5. Sistema atualiza `phoneNumber`.
6. Envio posterior sai pelo novo numero.

Aceite:

- historico anterior permanece auditavel;
- somente a escola afetada sofre impacto;
- nenhuma outra instancia e alterada.

### Cenario 3: evento sem vinculo de aluno

Passos:

1. Enviar evento com `userIdRaw` sem `DeviceStudentLink`.
2. Sistema grava `pending_link`.
3. Nenhuma mensagem e enviada.

Aceite:

- sem falso positivo para responsavel errado;
- erro fica claro no diagnostico.

## Riscos que precisam ser tratados

### 1. Redis instavel

No ambiente atual eu ja observei sinais de instabilidade de Redis em `worker` e `evolution-api`.

Sem Redis estavel:

- fila falha;
- worker perde job;
- Evolution pode desconectar ou entrar em reconexao;
- QR pode nao aparecer de forma consistente.

### 2. Instancia unica atual

Enquanto o envio continuar preso em `EVOLUTION_INSTANCE` global:

- nao existe isolamento por escola;
- nao atende o requisito de 1 numero por escola.

### 3. Falta de governanca de numero

Sem bloquear duplicidade de numero:

- o mesmo WhatsApp pode ser ligado em escola errada;
- suporte e auditoria ficam confusos.

### 4. Exposicao indevida do manager global

Se a escola tiver acesso cru ao manager da Evolution:

- a separacao entre tenants fica fragil.

## Recomendacao final

O desenho mais seguro e escalavel para o produto e:

- uma Evolution compartilhada na infraestrutura;
- uma instancia por escola;
- gestao das instancias pelo proprio app;
- QR Code school-scoped;
- envio sempre resolvido por `schoolId`;
- auditoria completa por escola, integrador e instancia.

Esse desenho atende:

- isolamento operacional;
- suporte mais simples;
- rastreabilidade;
- governanca de numero;
- crescimento de multiplas escolas por integrador.

## Conclusao pratica

Se o requisito comercial e:

- "cada escola tera o seu proprio numero"

entao o projeto precisa sair do modelo atual:

- `1 app -> 1 EVOLUTION_INSTANCE global`

e ir para:

- `1 escola -> 1 canal WhatsApp -> 1 instancia Evolution`

Com isso, o fluxo ideal passa a ser:

1. escola acessa o modulo WhatsApp no proprio painel;
2. cria ou reusa a instancia dela;
3. le o QR Code dela;
4. conecta o numero dela;
5. envia notificacoes apenas com o numero dela.
