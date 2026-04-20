param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$OutputPath = '',
  [string]$BaseUrl = 'http://localhost:4000',
  [string]$ConnectorName = '',
  [string]$EnrollmentToken = '',
  [int]$LocalPort = 4500,
  [string]$CloudMode = 'outbound_only',
  [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $ProjectRoot 'edge-agent\config.json'
}

$templatePath = Join-Path $ProjectRoot 'edge-agent\config.example.json'
if (-not (Test-Path $templatePath)) {
  throw "Template de configuracao nao encontrado: $templatePath"
}

if ((Test-Path $OutputPath) -and -not $Overwrite) {
  throw "O arquivo ja existe: $OutputPath. Use -Overwrite para recriar."
}

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$computerName = if ($env:COMPUTERNAME) { $env:COMPUTERNAME.ToLower() } else { 'edge-lab' }
if ([string]::IsNullOrWhiteSpace($ConnectorName)) {
  $ConnectorName = "edge-lab-$computerName"
}

$intakeSecret = [guid]::NewGuid().ToString('N')
$stateDir = Join-Path (Split-Path -Parent $OutputPath) 'state'

$config = Get-Content -Raw -Path $templatePath | ConvertFrom-Json
$config.cloud.baseUrl = $BaseUrl.TrimEnd('/')
$config.cloud.enrollmentToken = $EnrollmentToken
$config.connector.name = $ConnectorName
$config.connector.hostname = $computerName
$config.connector.cloudMode = if ($CloudMode -eq 'wireguard_management') { 'wireguard_management' } else { 'outbound_only' }
$config.localServer.port = $LocalPort
$config.localServer.intakeSecret = $intakeSecret
$config.stateDir = $stateDir

$json = $config | ConvertTo-Json -Depth 12
Set-Content -Path $OutputPath -Value $json -Encoding UTF8

Write-Host "[EdgeAgent] Configuracao criada com sucesso"
Write-Host "[EdgeAgent] Arquivo: $OutputPath"
Write-Host "[EdgeAgent] StateDir: $stateDir"
Write-Host "[EdgeAgent] Connector: $ConnectorName"
Write-Host "[EdgeAgent] Base URL: $($config.cloud.baseUrl)"
Write-Host "[EdgeAgent] Porta local: $LocalPort"
Write-Host ""
Write-Host "Proximos passos:"
Write-Host "1. Cole o token do edge em cloud.enrollmentToken, se ainda estiver vazio."
Write-Host "2. Ajuste os devices locais em edge-agent/config.json."
Write-Host "3. Execute: npm run edge:doctor"
Write-Host "4. Execute: npm run edge:claim"
Write-Host "5. Execute: npm run edge:run"
