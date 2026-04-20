# Plataforma de Acesso Escolar — IA Cloud

<div align="center">
  <img src="https://ui-avatars.com/api/?name=IA+Cloud&background=0284c7&color=fff&size=128&rounded=true" alt="IA Cloud Logo" width="128" />
  <br/>
  <h3>Plataforma Integrada de Gestão de Acesso, Notificações e Reconhecimento Facial</h3>
  <p>Desenvolvido orgulhosamente pela <strong><a href="https://iacloud.com.br">IA Cloud</a></strong></p>
</div>

---

## 🎯 Sobre a Solução
A **Plataforma de Acesso Escolar** é um sistema multitenant projetado para escolas e empresas integradoras. Ele permite o gerenciamento completo do acesso de alunos utilizando dispositivos físicos (catracas) equipados com reconhecimento facial, com o apoio de inteligência artificial de ponta e disparos automatizados de WhatsApp para os responsáveis.

A infraestrutura é inteiramente baseada em **Docker Swarm**, proporcionando alta disponibilidade, resiliência e escalabilidade autônoma, preparado para centenas de escolas em um único cluster.

## 🏛️ Desenhado por IA Cloud
- **Empresa:** [IA Cloud](https://iacloud.com.br)
- **Arquiteto da Solução:** Tarcísio Azevedo
- **Contato / Suporte:** +55 71 99119-9110

---

## 🏗️ Arquitetura e Tecnologias

A aplicação é dividida em microserviços otimizados para orquestração:
* **Frontend SPA:** React + Vite interagindo via APIs REST.
* **Backend API:** Node.js (Express) lidando com eventos de dispositivos IoT, Auth via JWT e gerência multitenant.
* **Bancos de Dados:** PostgreSQL (Relacional robusto), PgBouncer (Pool de conexões) e Redis (Cache, BullMQ e Socket.io pub/sub).
* **Armazenamento de Mídia:** MinIO (S3 compatível) em sub-rede privativa.
* **Automação & Gateways:** API do WhatsApp (Evolution API), Agentes Virtuais (Integrações LPR/CFTV de câmeras de segurança) e Fluxos (n8n).
* **Camada de Borda:** Traefik (Edge Router com Load Balancing nativo e HTTPS automático).

---

## 🚀 Como fazer o Deploy em Produção (VPS Linux)

A solução está **100% pronta para deploy** simplificado na sua VPS. Todo o ambiente foi provisionado no arquivo `docker-stack.yml` gerenciado pelo script de automação de Swarm.

### Pré-requisitos da Servidor (VPS)
- Ubuntu 20.04/22.04 ou Debian 11/12 (Limpo).
- **Docker** e **Docker Compose** instalados (não precisa configurar Swarm manualmente, o script o fará).
- Pelo menos 4GB de RAM (8GB Recomendado) e 50GB de NVMe.
- Liberação condicional das portas `80` (HTTP), `443` (HTTPS) e `2377` (Manejo do Swarm, se aplicável em múltiplas maquinas).

### Passo a Passo de Deploy

**1. Clone o Repositório na VPS:**
```bash
git clone https://github.com/tarcisioazevedo/iacloudacess.git
cd iacloudacess
```

**2. Execute o Script de Swarm Automatizado:**
Este comando irá iniciar o Swarm (caso não esteja), rotular a master-node como repositório principal de dados, compilar os contêineres e injetar todos os "Secrets" criptografados.
```bash
chmod +x scripts/deploy-swarm.sh
bash scripts/deploy-swarm.sh
```

**3. Verificação de Saúde do Cluster:**
Para ver se tudo já subiu com êxito e acessar a interface principal do gestor de rede:
```bash
npm run swarm:status
# ou
docker stack services school
```

**Pronto!** O seu projeto já pode ser acessado pelo domínio local da VPS via Traefik.

### 🛡️ Credenciais de Acesso Inicial (Super Admin)
Após o banco de dados rodar o seeder, a conta root estará disponível:
* **E-mail:** `admin@plataforma.com`
* **Senha:** `admin123`

_Recomendação de segurança: Alterar essa senha via painel após a primeira instalação na sua malha pública._

---

## 🧠 Funcionamento e Visões (Painéis)

*   **Visão de Superadmin:** Controle completo sobre sub-integradores parceiros e licenças globais do software.
*   **Visão de Integrador:** Portal em White-Label onde integradores monitoram os logs de falhas em aparelhos nas escolas a qual atendem e liberam ou bloqueiam sub-licenças.
*   **Visão Escolar:** Ferramenta diária para recepção liberar catracas remotamente (Virtual Devices), cadastrar biometrias de alunos, ver histórico fotográfico das passagens e gerenciar pagamentos.

<div align="center">
    <p><i>Building the future of automation with ❤️ by <b>IA Cloud</b></i></p>
</div>
