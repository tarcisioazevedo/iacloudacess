# Política de Retenção de Dados — IA Cloud Access Platform

**Última atualização:** 2026-04-24  
**Responsável:** Equipe de Engenharia IA Cloud  
**Base legal:** LGPD (Lei 13.709/2018), Art. 11 (dados biométricos), Art. 14 (dados de menores)

---

## 1. Categorias de Dados e Períodos de Retenção

| Categoria | Tipo de Dado | Período de Retenção | Mecanismo de Exclusão |
|-----------|-------------|--------------------|-----------------------|
| **Fotos de Eventos de Acesso** | Imagem facial capturada pela catraca no momento do acesso | **90 dias** | Lifecycle policy automática no MinIO (S3) |
| **Fotos de Cadastro de Alunos** | Imagem facial cadastrada para reconhecimento | Enquanto aluno **ativo** no sistema | Exclusão automática ao desativar/excluir aluno |
| **Dados Biométricos no Dispositivo** | Face encoding armazenado no hardware Intelbras | Enquanto aluno **vinculado** ao dispositivo | Remoção via CGI (`face_remove`) ao desvincular |
| **Registros de Acesso (AccessEvent)** | Metadados textuais (horário, direção, status) | **Indefinido** (auditoria) | Exclusão manual sob solicitação |
| **Logs de Auditoria (AuditLog)** | Ações administrativas do sistema | **Indefinido** (compliance) | N/A |
| **Logs Operacionais (OpsLog)** | Eventos técnicos do sistema | **180 dias** | Purge automático agendado |

## 2. Exclusão de Dados (Direito ao Esquecimento)

Quando um aluno é **desativado ou excluído** do sistema, os seguintes dados são automaticamente removidos:

1. **Banco de Dados (PostgreSQL):**
   - `StudentPhoto` → CASCADE delete (inclui `base64_optimized`)
   - `DeviceStudentLink` → CASCADE delete
   - `AccessEvent.studentId` → setado para NULL (eventos mantidos para auditoria, sem vínculo ao aluno)

2. **Object Storage (MinIO):**
   - Foto de cadastro do aluno (`student-photos/{studentId}.jpg`) → deletada automaticamente
   - Fotos de eventos de acesso vinculadas → deletadas automaticamente

3. **Dispositivo Físico (Intelbras):**
   - Face encoding → removido via `AccessFace.cgi?action=remove`
   - Registro de usuário → removido via `AccessUser.cgi?action=remove`
   - **Nota:** A remoção do dispositivo depende de conectividade. Se offline, o job de sync fará retry até 5x.

## 3. Configuração Técnica

### MinIO Lifecycle Policy
```bash
# Configurado automaticamente no bootstrap da API
STORAGE_HISTORY_RETENTION_DAYS=90
```

Objetos no bucket `event-photos` expiram automaticamente após 90 dias.

### Variáveis de Ambiente
| Variável | Default | Descrição |
|----------|---------|-----------|
| `STORAGE_HISTORY_RETENTION_DAYS` | `90` | Dias de retenção para fotos de eventos |

## 4. Acesso a Dados Biométricos

- Fotos são acessadas **exclusivamente** via URLs temporárias assinadas (presigned URLs) com **TTL de 15 minutos**
- O acesso é restrito pelo middleware de tenant isolation (`tenant.ts`)
- Cada escola só visualiza dados dos seus próprios alunos
- Cada integrador só acessa escolas sob sua gestão

## 5. Processo de Solicitação de Exclusão

Em caso de solicitação formal de exclusão de dados (LGPD Art. 18):

1. O responsável legal solicita a exclusão ao integrador/escola
2. O admin da escola desativa o aluno no painel (`DELETE /api/students/:id`)
3. O sistema automaticamente executa a limpeza completa (banco + storage + dispositivo)
4. Log de auditoria registra a operação para comprovação

## 6. Breach Notification

Em caso de incidente de segurança envolvendo dados biométricos:

- **Prazo:** Comunicação à ANPD em até 72 horas (LGPD Art. 48)
- **Responsável:** DPO designado pela IA Cloud
- **Escopo:** Notificação ao integrador e às escolas afetadas
- **Evidência:** Logs de auditoria e ops logs como trail de investigação
