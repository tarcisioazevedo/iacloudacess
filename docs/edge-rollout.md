# Rollout Cloud-First do Edge

## Objetivo

Executar as etapas de plataforma, provisionamento e readiness da unidade escolar antes do appliance fisico definitivo.

## O que fica pronto antes da Raspberry

- licenciamento validado por integrador e escola
- inventario de devices por unidade
- verificacao de compatibilidade AutoRegister CGI
- pacote de provisionamento gerado na nuvem
- token de enrollment preparado para a janela de campo
- fluxo de sync e heartbeat ja desenhado

## Sequencia sugerida

1. Cadastrar escola, unidade e devices na plataforma.
2. Revisar o pacote de provisionamento em `Edges`.
3. Confirmar firmware e compatibilidade AutoRegister dos devices Intelbras.
4. Definir se o site fica em `outbound_only` ou `wireguard_management`.
5. Gerar token de enrollment quando a instalacao for agendada.
6. Fazer a homologacao provisoria em notebook ou VM local.
7. Somente depois migrar o mesmo modulo para a Raspberry.

## Critico para operacao

- nao gerar token muito cedo sem janela de instalacao
- nao mandar tecnico a campo sem revisar firmware dos devices
- nao depender de VPN para coleta normal de dados
- usar VPN apenas como trilha opcional de suporte e manutencao
