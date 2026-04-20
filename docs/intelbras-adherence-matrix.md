# Matriz de Aderencia Intelbras

Data da analise: 2026-04-18

Escopo avaliado:

- documentacao Intelbras resumida em `C:\Users\Master\Desktop\IA Cloud Acess\api_summary.txt`
- aplicacao web/API em `C:\Users\Master\Desktop\IA Cloud Acess\school-access-platform`
- agente local em `C:\Users\Master\Desktop\IA Cloud Acess\school-access-platform\edge-agent`

Legenda de status:

- `Aderente`: implementacao compativel com o fluxo oficial e operacional no app
- `Parcial`: existe cobertura funcional, mas faltam partes relevantes do fluxo oficial
- `Nao aderente`: documentacao oficial sem correspondencia funcional no app atual

## Fluxo logico atual

1. O device Intelbras pode operar em tres trilhas principais no produto atual:
   - `direct_http`: API fala direto com o device via Digest Auth
   - `cloud_autoreg`: API fala pelo tunel CGI AutoRegister
   - `edge`: o `edge-agent` fala localmente com o device e envia eventos/sincronizacoes para a nuvem
2. Eventos oficiais entram por `POST /api/intelbras/events/:tenantKey`, sao normalizados em `api/services/intelbrasEventIngestion.ts` e persistidos em `access_events`.
3. Sincronizacao de cadastro sai da plataforma para o device por `deviceSyncWorker` ou pelo `edge-agent`, usando `AccessUser.cgi` e `AccessFace.cgi`.
4. Para AutoRegister, a plataforma recebe `POST /cgi-bin/api/autoRegist/connect`, autentica com `global/login`, mantem `global/keep-alive` e passa a enviar CGI pelo tunel.
5. Apos o ajuste desta rodada, o fallback oficial de foto por `FileManager.cgi?action=downloadFile` ficou coberto:
   - no cloud puro via tunel CGI binario AutoRegister
   - no edge local via `edge-agent`, baixando o snapshot do device antes de mandar o evento para a nuvem

## Matriz formal

| Documento Intelbras | Endpoint/app | Status | Risco | Acao recomendada |
| --- | --- | --- | --- | --- |
| `FileManager downloadFile` (`api_summary.txt:112-147`) | Oficial: `GET /cgi-bin/FileManager.cgi?action=downloadFile&fileName=...` -> App: `api/services/intelbrasEventIngestion.ts`, `api/services/deviceClientFactory.ts`, `api/services/intelbrasAutoRegisterService.ts`, `edge-agent/intelbrasAdapter.ts` | Aderente | Medio | Manter como fallback prioritario para evento com `FilePath` ou `SnapPath`; adicionar teste de regressao para payload binario e snapshot grande. |
| `AccessUser insertMulti` (`api_summary.txt:433-549`) | Oficial: `POST /cgi-bin/AccessUser.cgi?action=insertMulti` -> App: `api/services/intelbrasClient.ts`, `api/services/deviceClientFactory.ts`, `api/workers/deviceSyncWorker.ts`, `edge-agent/intelbrasAdapter.ts` | Aderente | Baixo | Validar em homologacao campos opcionais por firmware, principalmente `UserStatus`, `Authority`, `VerifyType` e horarios por usuario. |
| `AccessFace insertMulti` (`api_summary.txt:296-304`) | Oficial: `POST /cgi-bin/AccessFace.cgi?action=insertMulti` -> App: `api/services/intelbrasClient.ts`, `api/services/deviceClientFactory.ts`, `api/workers/deviceSyncWorker.ts`, `edge-agent/intelbrasAdapter.ts` | Aderente | Baixo | Preservar pipeline de otimizacao de foto e incluir teste com foto proxima do limite aceito pelo firmware. |
| `AccessUser updateMulti` (`api_summary.txt:560-646`) | Oficial: `POST /cgi-bin/AccessUser.cgi?action=updateMulti` -> App atual usa `removeMulti + insertMulti` em `api/workers/deviceSyncWorker.ts` e `edge-agent/intelbrasAdapter.ts` | Parcial | Medio | Trocar o fluxo de atualizacao para `updateMulti` quando o device suportar, reduzindo janela de inconsistencia e risco de perda temporaria de permissao. |
| `VSP_CGI.AutoRegister` (`api_summary.txt:1144-1215`) | Oficial: `configManager.cgi?action=setConfig&VSP_CGI.AutoRegister...` -> App: `api/routes/intelbrasAutoRegister.ts`, `api/services/intelbrasAutoRegisterService.ts`, UI em `src/pages/Devices.tsx` mostra `DeviceID` e `connectUrl` | Parcial | Medio | Gerar na UI o comando completo oficial de configuracao AutoRegister por device, incluindo `Type`, `Address/Domain`, `Port`, `UserName` e `Password`. |
| `AutoRegister connect/login/keep-alive` (documentacao AutoRegister + fluxo CGI) | Oficial: `POST /cgi-bin/api/autoRegist/connect`, `POST /cgi-bin/api/global/login`, `POST /cgi-bin/api/global/keep-alive` -> App: `api/routes/intelbrasAutoRegister.ts`, `api/services/intelbrasAutoRegisterService.ts`, `edge-agent/autoRegisterGateway.ts` | Aderente | Medio | Adicionar teste automatizado de sessao expirada, reconnect e keep-alive com perda parcial de rede. |
| `Servidor de Envio de Eventos 2.0` (`api_summary.txt:4381-4638`) | Oficial: `configManager.cgi?action=setConfig&Intelbras_ModeCfgII.UploadServerList[...]`, `Intelbras_UploadContentType.ContentType=jsonv2` e `Intelbras_ModeCfg.DeviceMode=3` -> App: `api/lib/runtimeConfig.ts`, `api/routes/intelbras.ts`, UI em `src/pages/Devices.tsx` | Parcial | Medio | Homologar o roteiro de campo com os tres passos oficiais e revisar se os `EventType[]` configurados refletem exatamente o que a plataforma persiste. |
| `Eventos AccessControl com JSON/multipart e imagem` (`api_summary.txt:4888-4925`) | Oficial: push com `Events[]`, `ImageInfo`, `ImageEncode`, `FilePath`, `SnapPath` -> App: `api/services/intelbrasEventIngestion.ts` e `edge-agent/intelbrasAdapter.ts` | Aderente | Medio | Criar suite de testes cobrindo `application/json`, `multipart/form-data`, `multipart/mixed`, imagem inline e fallback por arquivo. |
| `EventType adicionais do Post Eventos 2.0` (`api_summary.txt:4390-4481`) | Oficial: `UserManagerInfo`, `AccessControl`, `DoorStatus`, `AlarmEvent`, `SystemEvent` -> App configura todos em `api/lib/runtimeConfig.ts`, mas `api/services/intelbrasEventIngestion.ts` persiste apenas `AccessControl` | Parcial | Medio | Ou reduzir o comando gerado para os tipos realmente tratados, ou implementar persistencia/observabilidade para `DoorStatus`, `AlarmEvent`, `SystemEvent` e `UserManagerInfo`. |
| `EventManager` (`api_summary.txt:1319-1452`) | Oficial: polling pelo servidor -> App: sem client ou scheduler dedicado | Nao aderente | Medio | Implementar modulo de polling somente se houver device/firmware sem Post Eventos 2.0 confiavel; senao manter fora do escopo e documentar a decisao. |
| `SnapManager` (`api_summary.txt:5049-5105`) | Oficial: polling de eventos com imagem -> App: sem client ou scheduler dedicado | Nao aderente | Medio | Implementar apenas para modelos que nao entregam snapshot suficiente via Post Eventos 2.0; para o restante, manter `downloadFile` oficial como estrategia principal. |
| `Modo Online 1.0` (`api_summary.txt:2525-2724`) | Oficial: device consulta o servidor para liberar/negar acesso -> App: nao ha endpoint de decisao de acesso, nem keep-alive especifico | Nao aderente | Alto | Nao prometer este modo em campo; se for requisito, construir servidor de decisao, fallback offline e trilha de auditoria dedicada. |
| `Modo Online 2.0` (`api_summary.txt:2833-3033`) | Oficial: decisao em `application/json`, suporte a `image`, `audio`, `feedback`, `doorTime` -> App: parser recebe eventos, mas nao implementa o servidor oficial de autorizacao online | Nao aderente | Alto | Tratar como fase separada de arquitetura; exige endpoint de autorizacao, keep-alive, SLA de latencia e UX operacional especifica. |
| `recordFinder find/doSeekFind/getQuerySize` (`api_summary.txt:1569-1610`, `3149-3250`) | Oficial: consulta reversa de eventos, usuarios e volumes -> App: sem reconciliacao ativa por `recordFinder.cgi` | Nao aderente | Medio | Adicionar job de reconciliacao para inventario e auditoria, principalmente para comparar cadastro cloud x device e recuperar lacunas historicas. |
| `SS 7520/SS 7530 API 1.0` (`api_summary.txt` referencias de `recordUpdater.cgi`, `FaceInfoManager.cgi`) | Oficial: endpoints legados da linha antiga -> App: foco em `AccessUser.cgi` / `AccessFace.cgi` da linha atual | Parcial | Alto | Restringir comercialmente os modelos suportados ou criar adapter legado separado para firmwares antigos. |
| `Mapeamento de identidade de acesso` (uso de `UserID`, `CardNo`, `RecNo`) | Oficial: eventos podem chegar com diferentes chaves de identidade -> App: `api/services/accessEventService.ts` privilegia `UserID` | Parcial | Medio | Expandir correlacao por `CardNo`, `RecNo` e aliases de usuario para reduzir falsos "Nao identificado". |

## Diagnostico consolidado

### Pontos fortes

- A base atual ja suporta o fluxo central de sincronizacao de cadastro Intelbras.
- O recebimento de eventos oficiais ja cobre JSON, texto legado e multipart.
- O transporte hibrido entre nuvem, AutoRegister e edge local esta bem desenhado.
- A instrumentacao operacional com `opsLog` e diagnosticos ja existe e e reutilizavel.

### Falhas estruturais que mais impactam operacao

- O app ainda nao implementa o servidor oficial de `Modo Online 1.0/2.0`.
- Nao existe reconciliacao ativa usando `recordFinder`, o que dificulta auditoria e correcao de divergencias.
- A UI ainda nao guia toda a configuracao oficial de AutoRegister e de `jsonv2` de forma completa.
- O tratamento dos tipos de evento alem de `AccessControl` esta subaproveitado.

### Ajuste implementado nesta rodada

- `cloud_autoreg_only` agora consegue baixar snapshot oficial por `FileManager.cgi` usando resposta binaria no tunel CGI AutoRegister.
- `edge-agent` agora tenta anexar a foto oficial do evento usando `ImageEncode` ou, na falta dele, `FileManager.cgi` com `FilePath`/`SnapPath`.

### Proximas acoes priorizadas

1. Trocar `user_update` para `updateMulti`.
2. Incluir geracao assistida do comando oficial completo de AutoRegister na UI.
3. Homologar em campo o comando oficial de `Intelbras_UploadContentType.ContentType=jsonv2` no fluxo de configuracao.
4. Criar testes automatizados de payload Intelbras com imagem binaria, multipart e fallback por arquivo.
5. Decidir formalmente se `Modo Online 2.0` entra no roadmap do produto ou fica fora do escopo comercial.
