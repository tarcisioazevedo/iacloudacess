param(
  [string]$TaskName = 'IACloudEdgeAgent',
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $ProjectRoot 'edge-agent\config.json'
}

$runnerPath = Join-Path $ProjectRoot 'scripts\run-edge-agent.ps1'
if (-not (Test-Path $runnerPath)) {
  throw "Runner do edge-agent nao encontrado: $runnerPath"
}

$arguments = @(
  '-NoProfile'
  '-ExecutionPolicy', 'Bypass'
  '-File', "`"$runnerPath`""
  '-ProjectRoot', "`"$ProjectRoot`""
  '-ConfigPath', "`"$ConfigPath`""
) -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description 'IA Cloud Edge Agent - modulo local de comunicacao com a nuvem e AutoRegister Intelbras' `
  -Force | Out-Null

Write-Host "[EdgeAgent] Tarefa registrada com sucesso: $TaskName"
Write-Host "[EdgeAgent] Para testar manualmente, execute:"
Write-Host "powershell -ExecutionPolicy Bypass -File `"$runnerPath`" -ProjectRoot `"$ProjectRoot`" -ConfigPath `"$ConfigPath`""
