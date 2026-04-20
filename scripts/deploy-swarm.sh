#!/bin/bash
# ═══════════════════════════════════════════════
# School Access Platform — Swarm Deployment Script
# ═══════════════════════════════════════════════
set -e

STACK_NAME="${1:-school}"
DOMAIN="${DOMAIN:-localhost}"
VERSION="${VERSION:-latest}"
REGISTRY="${REGISTRY:-}"

echo "🏫 School Access Platform — Swarm Deploy"
echo "   Stack:    $STACK_NAME"
echo "   Domain:   $DOMAIN"
echo "   Version:  $VERSION"
echo ""

SECRET_DIR="${SECRET_DIR:-./secrets}"

# ─── 1. Verify Swarm mode ─────────────────────
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
  echo "⚠️  Docker Swarm not active. Initializing..."
  docker swarm init --advertise-addr $(hostname -I | awk '{print $1}') || true
fi

# ─── 2. Label nodes ──────────────────────────
echo "📋 Labeling current node for database placement..."
NODE_ID=$(docker info --format '{{.Swarm.NodeID}}')
docker node update --label-add db=true "$NODE_ID"

# ─── 3. Create secrets ───────────────────────
echo "🔐 Creating Docker secrets..."
mkdir -p "$SECRET_DIR"

ensure_secret_value() {
  local secret_name="$1"
  local env_name="$2"
  local file_path="$3"
  local generated_value=""

  eval "generated_value=\${$env_name:-}"
  if [ -n "$generated_value" ]; then
    printf '%s' "$generated_value"
    return 0
  fi

  if [ -f "$file_path" ]; then
    cat "$file_path"
    return 0
  fi

  if docker secret inspect "$secret_name" >/dev/null 2>&1; then
    echo "ERROR: secret '$secret_name' already exists, but $env_name and $file_path were not provided." >&2
    echo "Set $env_name or create $file_path with the same value before redeploying." >&2
    exit 1
  fi

  generated_value=$(openssl rand -base64 48 | tr -d '=/+' | head -c 48)
  printf '%s' "$generated_value" > "$file_path"
  chmod 600 "$file_path" 2>/dev/null || true
  printf '%s' "$generated_value"
}

create_secret_if_missing() {
  local name="$1"
  local value="$2"

  if docker secret inspect "$name" >/dev/null 2>&1; then
    echo "   [skip] Secret already exists: $name"
    return 0
  fi

  printf '%s' "$value" | docker secret create "$name" - >/dev/null
  echo "   [ok] Created secret: $name"
}

DB_PASS=$(ensure_secret_value "db_password" "DB_PASSWORD" "$SECRET_DIR/db_password.txt")
JWT_SEC=$(ensure_secret_value "jwt_secret" "JWT_SECRET" "$SECRET_DIR/jwt_secret.txt")
JWT_REF=$(ensure_secret_value "jwt_refresh_secret" "JWT_REFRESH_SECRET" "$SECRET_DIR/jwt_refresh_secret.txt")
MINIO_SEC=$(ensure_secret_value "minio_secret_key" "MINIO_SECRET_KEY" "$SECRET_DIR/minio_secret_key.txt")

export DB_PASSWORD="$DB_PASS"
export JWT_SECRET="$JWT_SEC"
export JWT_REFRESH_SECRET="$JWT_REF"
export MINIO_SECRET_KEY="$MINIO_SEC"

create_secret_if_missing "db_password" "$DB_PASS"
create_secret_if_missing "jwt_secret" "$JWT_SEC"
create_secret_if_missing "jwt_refresh_secret" "$JWT_REF"
create_secret_if_missing "minio_secret_key" "$MINIO_SEC"

echo ""
echo "📝 Secret material available in $SECRET_DIR"
echo "   Reuse these same values on every redeploy."
echo ""

# ─── 4. Create overlay networks ──────────────
echo "🌐 Creating overlay networks..."
docker network create --driver overlay --attachable school_public 2>/dev/null || true
docker network create --driver overlay --internal school_backend 2>/dev/null || true

# ─── 5. Build images ─────────────────────────
echo "🏗️  Building images..."
docker build -t "${REGISTRY}school-access-api:${VERSION}" -f Dockerfile .
docker build -t "${REGISTRY}school-access-frontend:${VERSION}" -f Dockerfile.frontend .

# If using a registry, push images
if [ -n "$REGISTRY" ]; then
  echo "📤 Pushing images to registry..."
  docker push "${REGISTRY}school-access-api:${VERSION}"
  docker push "${REGISTRY}school-access-frontend:${VERSION}"
fi

# ─── 6. Deploy stack ─────────────────────────
echo "🚀 Deploying stack '$STACK_NAME'..."
DOMAIN="$DOMAIN" VERSION="$VERSION" REGISTRY="$REGISTRY" \
  docker stack deploy -c docker-stack.yml "$STACK_NAME"

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "📊 Monitor deployment:"
echo "   docker stack services $STACK_NAME"
echo "   docker service logs ${STACK_NAME}_api -f"
echo ""
echo "🌐 Endpoints:"
echo "   App:       https://$DOMAIN"
echo "   API:       https://$DOMAIN/api/health"
echo "   Traefik:   https://traefik.$DOMAIN"
echo "   Portainer: https://portainer.$DOMAIN"
echo "   MinIO:     https://minio.$DOMAIN"
echo ""
echo "💡 Add worker nodes:"
echo "   docker swarm join-token worker"
