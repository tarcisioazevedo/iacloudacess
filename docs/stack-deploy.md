# Deploy do Stack

## Objetivo

Este documento define o fluxo minimo para subir a plataforma em Docker Swarm sem drift entre desenvolvimento e producao.

Premissas:

- `docker-stack.yml` e exclusivo para producao em Swarm
- `docker-compose.dev.yml` e exclusivo para desenvolvimento local
- o stack de producao usa apenas imagens ja construidas e publicadas
- secrets de producao devem existir antes do deploy

## Secrets obrigatorios no Swarm

Criar estes secrets antes do primeiro `docker stack deploy`:

- `db_password`
- `jwt_secret`
- `jwt_refresh_secret`
- `minio_secret_key`

Exemplo:

```bash
printf '%s' 'senha-forte-do-banco' | docker secret create db_password -
printf '%s' 'jwt-super-seguro' | docker secret create jwt_secret -
printf '%s' 'refresh-super-seguro' | docker secret create jwt_refresh_secret -
printf '%s' 'senha-forte-do-minio' | docker secret create minio_secret_key -
```

## Imagens obrigatorias

O Swarm nao faz `build` automaticamente a partir do `docker-stack.yml`.

Antes do deploy, publicar pelo menos estas imagens:

- `school-access-api:<versao>`
- `school-access-frontend:<versao>`

Exemplo:

```bash
docker build -t registry.exemplo.com/school-access-api:0.3.1 -f Dockerfile .
docker build -t registry.exemplo.com/school-access-frontend:0.3.1 -f Dockerfile.frontend .
docker push registry.exemplo.com/school-access-api:0.3.1
docker push registry.exemplo.com/school-access-frontend:0.3.1
```

## Variaveis de ambiente do deploy

Exportar antes do deploy:

- `REGISTRY`
- `VERSION`
- `DOMAIN`
- `DB_USER`
- `DB_PASSWORD`
- `MINIO_USER`

Observacao:

- `DB_PASSWORD` precisa ser o mesmo valor gravado no secret `db_password`
- `DB_PASSWORD` tambem e usado por `evolution-api` e `n8n`, que nao leem `POSTGRES_PASSWORD_FILE`

Exemplo:

```bash
export REGISTRY=registry.exemplo.com/
export VERSION=0.3.1
export DOMAIN=plataforma.exemplo.com
export DB_USER=schooladmin
export DB_PASSWORD=senha-forte-do-banco
export MINIO_USER=minioadmin
```

## Deploy

```bash
docker stack deploy -c docker-stack.yml school
```

## Validacao minima

Depois do deploy, validar:

```bash
docker service ls
docker service ps school_api
docker service ps school_frontend
docker service ps school_postgres
docker service ps school_worker
```

Checagens esperadas:

- `school_api` com replicas ativas
- `school_frontend` com replicas ativas
- `school_postgres` saudavel
- `school_worker` ativo
- `school_redis` ativo
- `school_minio` saudavel

## Desenvolvimento local

Para desenvolvimento local, usar:

```bash
docker compose -f docker-stack.yml -f docker-compose.dev.yml up -d --build
```

Neste fluxo:

- secrets sao lidos de arquivos locais em `./secrets`
- imagens sao construidas localmente
- overrides de desenvolvimento trocam redes overlay por bridge
- apenas `postgres`, `redis`, `minio`, `api` e `frontend` sobem por padrao
- `traefik`, `portainer`, `worker`, `api-migrator`, `evolution-api` e `n8n` ficam em perfis opcionais

## Regras operacionais

- nao usar `docker stack deploy` esperando `build` local
- nao misturar defaults de desenvolvimento com secrets de producao
- nao considerar a API pronta apenas porque o processo subiu; validar banco, redis, storage e workers
