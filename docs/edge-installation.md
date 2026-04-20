# Instalacao do Modulo Edge

## Objetivo

Este documento fecha a instalacao operacional do modulo de comunicacao local enquanto a Raspberry Pi ainda nao esta disponivel e tambem deixa o caminho pronto para migracao futura.

## Cenarios suportados

- notebook Windows temporario na escola
- notebook Linux
- mini PC
- Raspberry Pi 5 ou equipamento equivalente

## Requisitos

- Node.js instalado
- dependencias do projeto instaladas com `npm install`
- `edge-agent/config.json` preenchido
- acesso local aos dispositivos Intelbras
- saida HTTPS 443 para a nuvem

## Endpoints locais

- UI operacional: `http://IP_DO_EDGE:4500/ui`
- health local: `http://IP_DO_EDGE:4500/health`
- AutoRegister CGI: `http://IP_DO_EDGE:4500/cgi-bin/api/autoRegist/connect`
- ingestao local de eventos: `http://IP_DO_EDGE:4500/local/intelbras/events/:deviceRef`

## Windows provisiorio

Arquivos:

- runner: `scripts/run-edge-agent.ps1`
- instalador da tarefa: `scripts/install-edge-agent-windows.ps1`

Passos:

1. Ajuste `edge-agent/config.json`.
2. Teste manualmente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-edge-agent.ps1
```

3. Registre como tarefa de inicializacao:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-edge-agent-windows.ps1
```

## Linux / Raspberry

Arquivo:

- service unit: `scripts/edge-agent.service`

Passos sugeridos:

1. Copie o projeto para `/opt/school-access-platform`.
2. Copie `scripts/edge-agent.service` para `/etc/systemd/system/edge-agent.service`.
3. Ajuste o caminho do `WorkingDirectory` se necessario.
4. Habilite o servico:

```bash
sudo systemctl daemon-reload
sudo systemctl enable edge-agent
sudo systemctl start edge-agent
sudo systemctl status edge-agent
```

## Ordem recomendada de homologacao

1. Subir o edge e abrir a UI local.
2. Fazer o claim com token da nuvem.
3. Validar licenca integrada no painel.
4. Configurar um device Intelbras com `AutoRegister CGI`.
5. Confirmar sessao autenticada e keep-alive no painel.
6. Testar ingestao de evento e sync job.
7. Somente depois mover a instalacao para Raspberry Pi.
