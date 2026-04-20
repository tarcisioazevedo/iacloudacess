# Plano de Testes e Confiabilidade do Edge

## Objetivo

Registrar o plano de homologacao e confiabilidade do edge local para que a equipe nao perca de vista:

- o que ja pode ser testado agora
- o que cada etapa realmente valida
- o que continua em aberto
- quais sao os criterios minimos antes de avancar para piloto e escala

## Visao executiva

Hoje a plataforma ja permite validar bem o fluxo `nuvem <-> edge` em laboratorio, mesmo sem Raspberry e mesmo sem device fisico final.

Isso significa que ja conseguimos provar:

- provisionamento do edge
- claim com token de enrollment
- autenticacao do edge na nuvem
- heartbeat e visibilidade operacional
- consulta de licenca integrada
- spool local de eventos
- envio de eventos para a nuvem
- painel local de suporte e homologacao

Mas isso ainda nao significa aceite de producao de campo.

Ainda faltam testes com:

- device Intelbras real
- AutoRegister CGI real
- rede real da escola
- falhas de internet e reinicio abrupto
- operacao de longa duracao
- escala com varios sites simultaneos

## O que o laboratorio atual testa

### Camada 1 - Laboratorio sem hardware final

Objetivo:

Validar a arquitetura do edge e o encanamento entre o modulo local e a nuvem.

Escopo:

- gerar `config.json` do edge local
- fazer `doctor`
- fazer `claim`
- validar `edgeId` e `edgeKey`
- subir UI local do edge
- enviar heartbeat
- consultar licenca
- gerar evento de teste local
- enfileirar e drenar spool local
- confirmar recebimento do evento na plataforma

Ferramentas ja prontas:

- `powershell -ExecutionPolicy Bypass -File .\scripts\init-edge-agent-config.ps1`
- `npm run edge:doctor`
- `npm run edge:claim`
- `npm run edge:run`
- `npm run edge:simulate-event`
- UI local em `http://IP_DO_EDGE:4500/ui`

Evidencias esperadas:

- edge aparece na unidade correta
- enrollment sai de `pending_claim` para `online`, `degraded` ou `offline`
- UI local mostra `Claimed: yes`
- heartbeat aparece na plataforma
- evento de teste entra no spool e depois sai
- evento chega na nuvem

Criterio de aprovacao:

- claim concluido sem erro
- heartbeat operacional
- licenca consultada com sucesso
- pelo menos 1 evento de teste enviado e recebido

## O que este laboratorio nao testa

O laboratorio atual nao prova:

- login digest real no equipamento Intelbras
- AutoRegister CGI vindo do firmware real
- keep-alive real do equipamento por varias janelas
- sync real de usuario, face e remocao no equipamento
- latencia, perda e jitter da rede da escola
- bloqueio por firewall, proxy, NAT ou ACL
- comportamento do WireGuard em producao
- resistencia a queda de energia
- operacao continua por horas ou dias
- varios edges ativos ao mesmo tempo em carga real

## Camadas de homologacao recomendadas

### Camada 2 - Laboratorio com rede real

Objetivo:

Validar o edge rodando em notebook, mini PC ou VM dentro de uma rede parecida com a da escola.

O que testar:

- saida HTTPS 443 para a nuvem
- abertura da UI local
- claim e heartbeat por algumas horas
- geracao e envio de eventos de teste
- estabilidade do processo local

Evidencias esperadas:

- sem perda recorrente de heartbeat
- sem crescimento anormal do spool
- sem travamento do processo

Criterio de aprovacao:

- edge mantem contato com a nuvem por periodo prolongado
- nao ha erro recorrente no painel local

### Camada 3 - Device Intelbras real

Objetivo:

Validar a integracao real com o fabricante.

O que testar:

- `heartbeat()` real no device
- `insertUsers()`
- `insertFaces()`
- `removeFace()`
- ingestao de evento real
- AutoRegister CGI, quando o modelo e firmware suportarem

Evidencias esperadas:

- device aparece online de forma consistente
- comandos executam no equipamento
- eventos reais sobem para a plataforma
- sessao AutoRegister autentica e mantem keep-alive

Criterio de aprovacao:

- pelo menos 1 device homologado ponta a ponta
- pelo menos 1 fluxo de sync e 1 fluxo de evento real concluidos

### Camada 4 - Falhas controladas

Objetivo:

Medir recuperacao e comportamento sob falha.

O que testar:

- queda de internet
- retorno de internet
- reinicio do processo do edge
- reinicio da maquina
- fila local acumulando e depois drenando
- token expirado
- licenca bloqueada ou expirada

Evidencias esperadas:

- spool preservado
- edge volta a enviar heartbeat
- eventos pendentes sobem depois da reconexao
- erros aparecem com clareza na UI local e na plataforma

Criterio de aprovacao:

- sem perda silenciosa de evento
- recuperacao automatica ou com acao operacional simples

### Camada 5 - Piloto controlado

Objetivo:

Validar a operacao assistida em 1 escola real.

O que testar:

- rotina diaria
- estabilidade ao longo de dias
- comportamento da equipe de suporte
- clareza das telas para troubleshooting
- comportamento do edge com devices da unidade

Evidencias esperadas:

- operacao sem bloqueio funcional
- suporte entende rapidamente o estado do edge
- taxa baixa de incidentes manuais

Criterio de aprovacao:

- piloto roda por janela acordada sem falha critica

### Camada 6 - Escala

Objetivo:

Validar readiness para varias escolas e varios integradores.

O que testar:

- varios edges ativos simultaneamente
- escolas com IP privado repetido
- integradores diferentes no mesmo cluster
- volume de heartbeat
- volume de eventos
- filas de sync em paralelo

Evidencias esperadas:

- isolamento correto por integrador, escola e unidade
- nenhum conflito por IP local repetido
- dashboards e operacao continuam legiveis

Criterio de aprovacao:

- sem mistura de tenant
- sem degradacao relevante da operacao

## Matriz pratica do que ja esta pronto

Pronto agora:

- provisionamento do enrollment
- status de enrollment na nuvem
- claim do edge
- heartbeat
- licenciamento
- painel operacional local
- simulacao de evento sem hardware final
- janela de provisioning na tela `Edges`
- acompanhamento do edge no onboarding

Parcial:

- ingestao local de evento via endpoint
- AutoRegister CGI Intelbras
- sync real de jobs
- modo `wireguard_management`

Em aberto:

- teste real com device Intelbras homologado
- teste prolongado de estabilidade
- spool mais robusto que JSON
- criptografia local de credenciais
- runbook formal de incidentes
- monitoracao e alertas de producao

## Checklist minimo antes de mandar tecnico a campo

1. Validar licenca e status do tenant.
2. Confirmar unidade escolar e devices cadastrados.
3. Revisar compatibilidade de firmware para AutoRegister.
4. Gerar token de enrollment perto da janela de instalacao.
5. Validar `edge:doctor`.
6. Confirmar rede local do site e saida HTTPS.
7. Definir se o site sera `outbound_only` ou `wireguard_management`.
8. Garantir que a equipe sabe abrir a UI local e interpretar o status.

## Checklist minimo para aceitar piloto

1. Claim e heartbeat funcionando.
2. Licenca consultada sem erro.
3. Pelo menos 1 evento de teste indo e voltando.
4. Pelo menos 1 device real homologado.
5. Recuperacao testada apos falha controlada.
6. Operacao sabe diferenciar `pending_claim`, `claimed_waiting_heartbeat`, `online`, `degraded`, `offline` e `expired`.

## Principais riscos em aberto

### Risco 1 - Compatibilidade real do fabricante

Descricao:

O codigo suporta o fluxo Intelbras, mas a variacao real de firmware, tempo de resposta e comportamento de sessao ainda precisa ser provada em device real.

Mitigacao:

- homologar com pelo menos um modelo suportado
- registrar firmware usado
- guardar evidencias do fluxo de login e keep-alive

### Risco 2 - Resiliencia local insuficiente

Descricao:

O spool atual em JSON e funcional para laboratorio, mas ainda nao e a forma mais forte para operacao com falha repetida.

Mitigacao:

- migrar spool para SQLite
- testar reinicio abrupto
- medir crescimento de fila

### Risco 3 - Observabilidade ainda parcial

Descricao:

As telas ja ajudam muito, mas ainda precisamos de padrao de log, alerta e rotina de suporte.

Mitigacao:

- definir alertas de heartbeat e fila
- definir severidade de incidentes
- documentar runbook de suporte

### Risco 4 - Escala ainda nao provada

Descricao:

A arquitetura foi desenhada corretamente para varios sites com IP privado repetido, mas o comportamento operacional em volume ainda nao foi testado em ambiente realista.

Mitigacao:

- rodar teste com varios edges
- medir carga de heartbeat e eventos
- revisar dashboards de operacao

## Definicao pratica de pronto por etapa

Nao pronto para escala:

- enquanto nao houver device real homologado
- enquanto nao houver teste de falha controlada
- enquanto nao houver piloto assistido

Pronto para piloto controlado:

- quando o laboratorio estiver verde
- quando pelo menos 1 device real estiver homologado
- quando a recuperacao apos falha for comprovada

Pronto para rollout mais amplo:

- quando piloto passar
- quando observabilidade e runbook estiverem definidos
- quando a equipe operacional souber tratar incidentes sem depender de quem desenvolveu

## Proximos passos recomendados

1. Criar `edge-agent/config.json` local com o script de inicializacao.
2. Rodar claim e heartbeat no laboratorio.
3. Executar evento de teste pela UI local.
4. Homologar 1 device Intelbras real.
5. Fazer teste de queda e retorno de internet.
6. Formalizar alertas, logs e runbook.
