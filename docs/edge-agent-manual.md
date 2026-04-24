# Manual Técnico — IA Cloud Access Edge Agent

## 1. O que é o Edge Agent?
O **Edge Agent** é um software desenhado para operar na infraestrutura local da escola (geralmente instalado no computador da secretaria). Seu papel é servir como uma "ponte inteligente" entre os controladores de acesso faciais Intelbras (Catracas/Portas) e a nuvem da plataforma IA Cloud Access.

Sua arquitetura foi criada especificamente para resolver os três maiores problemas de integração de hardware em escolas:
1. **Firewalls e CGNAT:** Não exige liberação de portas externas nem IP Fixo na escola.
2. **Quedas de Internet:** Garante que a escola não perca dados de acesso se a conexão cair.
3. **Segurança:** O dispositivo Intelbras não fica exposto para a internet pública, protegendo os dados sensíveis dos alunos.

---

## 2. Como Funciona a Arquitetura de Conexão?

A operação do Edge Agent divide-se em duas camadas isoladas:

### Camada 1: LAN (Local Area Network) — Dispositivo ↔ Edge Agent
- **Comunicação Direta (CGI):** A catraca envia eventos em tempo real para o Edge Agent, que escuta silenciosamente na porta 4500.
- **Isolamento de Rede:** Tudo acontece localmente via IP interno (ex: 192.168.0.x). 
- **Resiliência Local:** Se a internet da escola cair, a catraca continua reconhecendo faces normalmente. Os eventos gerados são recebidos pelo Edge Agent e armazenados num "cofre temporário" criptografado no disco rígido local do PC da secretaria.

### Camada 2: WAN (Internet) — Edge Agent ↔ Nuvem (IA Cloud)
A comunicação com a nuvem ocorre apenas de **dentro para fora** (Outbound - Pull Strategy). O Edge Agent trabalha em ciclos automáticos (Pollers):
- **Event Flush (A cada 10 seg):** O agente descarrega todos os eventos acumulados no PC para a nuvem. Se a rede estava caída, centenas de eventos podem subir em um único lote.
- **Sync Poll (A cada 15 seg):** O agente consulta a nuvem em busca de novos cadastros (fotos novas, bloqueios de inadimplência, etc) e os repassa para a catraca via comandos locais.
- **Heartbeat (A cada 30 seg):** O agente avisa a nuvem sobre o status online/offline da máquina local e dos hardwares vinculados.

---

## 3. Preparação Profissional para Distribuição (Build Windows)

A instalação na escola não exige conhecimentos avançados. O código em Node.js é empacotado num executável invisível nativo do Windows (`.exe`).

### Estrutura de Geração do `.exe`:
O sistema utiliza o pacote NPM `pkg` associado ao `esbuild` para gerar a compilação.
Para compilar a versão mais recente, execute no terminal do projeto base:

\`\`\`bash
npm run build:edge-win
\`\`\`

### Conteúdo do Pacote de Liberação (\`release-edge-win64\`):
A rotina de build produz uma pasta pronta para entrega ao cliente final:
- **\`IA-Cloud-Edge.exe\`:** Executável autocontido com o runtime Node 18 embarcado.
- **\`config.json\`:** Arquivo de configurações local (onde são inseridos IPs locais e Token da nuvem).
- **\`instalar-servico.bat\`:** Script instalador automático.
- **\`desinstalar-servico.bat\`:** Script para remoção segura do serviço.

---

## 4. Guia Rápido de Instalação na Escola

**Passo 1:** Descompactar o arquivo \`.zip\` recebido em uma pasta segura (Ex: \`C:\\IA-Cloud-Edge\`).
**Passo 2:** Editar o arquivo \`config.json\` inserindo:
- \`enrollmentToken\`: Token de segurança gerado no Painel Admin da escola na nuvem.
- \`ipAddress\` e credenciais locais da catraca Intelbras.
**Passo 3:** Clicar com o botão direito no arquivo \`instalar-servico.bat\` e selecionar **"Executar como Administrador"**.

O script irá instalar o Edge Agent como um *Windows Service*. Ele passará a rodar em modo invisível na máquina e irá religar automaticamente caso o PC da escola seja reiniciado. Não há telas ou abas atrapalhando o uso normal do computador.

### Gestão e Troubleshooting
Toda a operação pode ser acompanhada pelo Painel Master Cloud. Se a nuvem parar de receber o pacote *Heartbeat*, o sistema marca o Edge como "Offline" após 3 minutos e dispara os alertas correspondentes.
