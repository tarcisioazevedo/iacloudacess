#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# IA Cloud Access Platform — VPS Setup Script
#
# Uso: curl -fsSL https://raw.githubusercontent.com/tarcisioazevedo/iacloudacess/main/scripts/setup-vps.sh | bash
#  Ou: bash scripts/setup-vps.sh
#
# Compatível com: Ubuntu 20.04, 22.04, 24.04 LTS
# Requer:         root ou sudo
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Cores para output ────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

REPO_URL="${REPO_URL:-https://github.com/tarcisioazevedo/iacloudacess.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/iacloud-access}"
APP_USER="${APP_USER:-ubuntu}"

# ─── Verificações iniciais ────────────────────
echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║   IA Cloud Access Platform — VPS Setup      ║"
echo "║   iacloud.com.br                            ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || die "Execute como root: sudo bash scripts/setup-vps.sh"

# Detectar OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="$ID"
  OS_VERSION="$VERSION_ID"
else
  die "Sistema operacional não suportado. Use Ubuntu 20.04/22.04/24.04"
fi

[[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" ]] || \
  warn "OS $OS_ID não testado. Continuando mesmo assim..."

log "Sistema: $OS_ID $OS_VERSION"
log "Diretório de instalação: $INSTALL_DIR"
log "Usuário da aplicação: $APP_USER"
echo ""

# ─── 1. Atualizar sistema ─────────────────────
log "Atualizando pacotes do sistema..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git openssl ca-certificates \
  gnupg lsb-release apt-transport-https \
  netcat-openbsd jq ufw fail2ban
ok "Pacotes instalados"

# ─── 2. Instalar Docker ───────────────────────
if command -v docker &>/dev/null; then
  DOCKER_VERSION=$(docker --version)
  ok "Docker já instalado: $DOCKER_VERSION"
else
  log "Instalando Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  ok "Docker instalado: $(docker --version)"
fi

# Adicionar usuário ao grupo docker
if id "$APP_USER" &>/dev/null; then
  usermod -aG docker "$APP_USER"
  ok "Usuário '$APP_USER' adicionado ao grupo docker"
fi

# ─── 3. Inicializar Docker Swarm ──────────────
if docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q "active"; then
  ok "Docker Swarm já está ativo"
else
  log "Inicializando Docker Swarm..."
  PRIMARY_IP=$(ip -4 route get 8.8.8.8 | awk '{print $7; exit}' 2>/dev/null || hostname -I | awk '{print $1}')
  docker swarm init --advertise-addr "$PRIMARY_IP"
  ok "Docker Swarm inicializado (manager node: $PRIMARY_IP)"
fi

# ─── 4. Labeling do nó ────────────────────────
log "Configurando labels do nó Swarm..."
NODE_ID=$(docker info --format '{{.Swarm.NodeID}}')
docker node update --label-add db=true "$NODE_ID"
ok "Label db=true aplicado ao nó $NODE_ID"

# ─── 5. Clonar repositório ────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Repositório já existe em $INSTALL_DIR — atualizando..."
  cd "$INSTALL_DIR"
  git pull origin main
  ok "Repositório atualizado"
else
  log "Clonando repositório em $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  ok "Repositório clonado"
fi

cd "$INSTALL_DIR"

# ─── 6. Criar estrutura de diretórios ─────────
log "Criando diretórios necessários..."
mkdir -p secrets backups logs

# Permissões seguras para secrets
chmod 700 secrets
if id "$APP_USER" &>/dev/null; then
  chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
fi
ok "Estrutura de diretórios criada"

# ─── 7. Configurar .env ───────────────────────
if [ ! -f "$INSTALL_DIR/.env" ]; then
  log "Criando .env a partir do exemplo..."
  cp .env.example .env
  warn "Configure o .env com seu domínio e e-mail ACME antes do deploy:"
  echo ""
  echo "   nano $INSTALL_DIR/.env"
  echo ""
  echo "   Variáveis obrigatórias:"
  echo "     DOMAIN=seudominio.com.br"
  echo "     ACME_EMAIL=admin@seudominio.com.br"
  echo ""
else
  ok ".env já existe"
fi

# ─── 8. Configurar log rotation Docker ────────
log "Configurando log rotation do Docker..."
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  },
  "metrics-addr": "127.0.0.1:9323",
  "experimental": false
}
EOF
systemctl reload docker 2>/dev/null || systemctl restart docker
ok "Log rotation configurado (50MB × 3 arquivos por container)"

# ─── 9. Configurar firewall UFW ───────────────
log "Configurando firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (redirect to HTTPS)'
ufw allow 443/tcp comment 'HTTPS'
# Docker Swarm ports (apenas entre nós do cluster)
ufw allow 2377/tcp comment 'Docker Swarm management'
ufw allow 7946/tcp comment 'Docker Swarm node discovery'
ufw allow 7946/udp comment 'Docker Swarm node discovery UDP'
ufw allow 4789/udp comment 'Docker overlay network'
ufw --force enable
ok "Firewall UFW configurado"

# ─── 10. Configurar fail2ban ──────────────────
log "Configurando fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban
ok "Fail2ban ativo"

# ─── 11. Criar cron de backup ─────────────────
log "Configurando backup automático diário..."
CRON_JOB="0 2 * * * cd $INSTALL_DIR && bash scripts/backup-postgres.sh >> $INSTALL_DIR/logs/backup.log 2>&1"
# Evitar duplicata
(crontab -l 2>/dev/null | grep -v "backup-postgres" ; echo "$CRON_JOB") | crontab -
ok "Backup automático agendado para 02:00 diariamente"

# ─── 12. Configurar swap (se memória < 4GB) ───
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
if [ "$TOTAL_MEM" -lt 4096 ] && ! swapon --show | grep -q "swap"; then
  log "Memória < 4GB — criando swap de 2GB..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  ok "Swap de 2GB criado e ativado"
fi

# ─── Resumo final ─────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  ✅  Setup concluído com sucesso!           ${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  📁 Diretório:    ${BOLD}$INSTALL_DIR${NC}"
echo -e "  🐳 Docker:       ${BOLD}$(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"
echo -e "  🔵 Swarm:        ${BOLD}Manager node ativo${NC}"
echo ""
echo -e "${YELLOW}  Próximos passos:${NC}"
echo ""
echo -e "  1. Configure o .env:"
echo -e "     ${BOLD}nano $INSTALL_DIR/.env${NC}"
echo ""
echo -e "  2. Execute o deploy:"
echo -e "     ${BOLD}cd $INSTALL_DIR${NC}"
echo -e "     ${BOLD}DOMAIN=seudominio.com.br ACME_EMAIL=admin@dominio.com.br bash scripts/deploy-swarm.sh${NC}"
echo ""
echo -e "  3. Monitore o stack:"
echo -e "     ${BOLD}docker stack services school${NC}"
echo ""
