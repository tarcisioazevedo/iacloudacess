# Arquitetura Edge para Conexao Escola <-> Nuvem

## Visao geral

Esta plataforma passa a operar no modelo:

`Fabricante -> Integrador -> Escola -> Unidade/Site -> Edge local -> Dispositivos`

O principio principal e simples:

- a nuvem nao precisa "enxergar" a rede local da escola diretamente
- quem enxerga a LAN e o `edge local`
- o edge cria uma conexao de saida segura para a nuvem
- a nuvem coordena o que precisa ser sincronizado e recebe os eventos consolidados

Isso resolve o problema de varias escolas terem o mesmo IP privado local, como `192.168.0.201`, porque o endereco deixa de ser global. O IP local vale apenas dentro do contexto de um `edge` especifico.

## Mapeamento no software

- `Integrator`: parceiro que opera varias escolas
- `School`: cliente final
- `SchoolUnit`: site/campus/local fisico da escola
- `EdgeConnector`: gateway local daquele site
- `Device`: dispositivo da rede local
- `DeviceSyncJob`: fila de comandos que o edge coleta e executa no dispositivo
- `AccessEvent`: evento normalizado enviado do edge para a nuvem

## Provisionamento

Fluxo esperado:

1. O painel da nuvem gera um `EdgeEnrollmentToken` para a unidade escolar.
2. O painel tambem consegue gerar um `Provisioning Pack` com readiness da unidade, inventario dos devices e perfil de rede.
2. O edge local usa esse token uma unica vez em `/api/edge/enroll`.
3. A nuvem devolve `edgeId` e `edgeKey`.
4. A partir dai, o edge se autentica em todas as chamadas com identidade propria.

Isso evita compartilhar credenciais humanas com o roteador/gateway e separa acesso operacional de acesso administrativo.

## Fluxo operacional

### 1. Sincronizacao da nuvem para a escola

Quando o sistema precisa cadastrar ou atualizar um aluno no dispositivo:

1. a plataforma cria um `DeviceSyncJob`
2. se o dispositivo estiver em `direct`, o job pode ir para o worker BullMQ
3. se o dispositivo estiver em `edge`, o job fica pendente para o edge buscar
4. o edge chama `/api/edge/sync-jobs`
5. o edge aplica no dispositivo local
6. o edge confirma o resultado em `/api/edge/sync-jobs/:jobId/result`

### 2. Coleta da escola para a nuvem

Quando o dispositivo gera eventos:

1. o dispositivo envia para o edge local
2. o edge normaliza o evento
3. o edge envia lote para `/api/edge/events`
4. a nuvem faz deduplicacao, correlaciona aluno/dispositivo e publica o evento

### 3. Observabilidade

O edge envia `heartbeat` periodico para `/api/edge/heartbeat` com:

- status do edge
- versao
- sub-redes locais
- status dos dispositivos que ele administra

## Recomendacao de rede

Padrao recomendado:

- `outbound-only` como caminho principal de dados
- `WireGuard` opcional para suporte e gestao

Ou seja:

- os dados do dia a dia sobem por HTTPS com conexao iniciada pelo edge
- a VPN nao e obrigatoria para a coleta funcionar
- a VPN serve para manutencao, troubleshooting e acesso controlado quando necessario

## Escalabilidade

Esta arquitetura escala bem porque:

- separa identidade logica de endereco IP local
- permite varias escolas com a mesma faixa privada
- isola falhas por `edge` e por `site`
- reduz dependencia de tunel permanente por escola
- facilita multi-tenant por integrador

## Endpoints introduzidos

- `POST /api/edge/enrollment-tokens`
- `GET /api/edge/connectors`
- `GET /api/edge/provisioning-pack/:schoolUnitId`
- `POST /api/edge/enroll`
- `POST /api/edge/heartbeat`
- `GET /api/edge/sync-jobs`
- `POST /api/edge/sync-jobs/:jobId/result`
- `POST /api/edge/events`

## Pacote de provisionamento

Antes de enviar tecnico para campo, a nuvem agora pode montar um pacote por unidade contendo:

- status de licenciamento
- quantidade de devices e edges ja presentes
- compatibilidade AutoRegister CGI por device Intelbras
- modo de conectividade sugerido
- portas e premissas de rede
- sequencia operacional de rollout

Isso antecipa a maior parte do trabalho de implantacao sem depender do appliance final.

## Observacoes de seguranca

- usuarios humanos continuam autenticando com JWT
- edges usam credencial propria (`edgeId` + `edgeKey`)
- o socket de usuarios agora entra na sala da escola a partir do token autenticado, e nao mais da query string do cliente
- para dispositivos `edge`, a senha do equipamento pode ficar somente no edge local

## Proximos passos recomendados

- criptografar credenciais de dispositivos no edge e, quando existir armazenamento em nuvem, usar KMS/secret manager
- criar tela administrativa para provisionar edge e associar dispositivos por unidade
- adicionar rotacao de `edgeKey`
- criar worker/daemon real do edge local para Intelbras e outros fabricantes
- criar migration SQL versionada para producao
