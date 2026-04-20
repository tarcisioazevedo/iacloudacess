param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'

Set-Location $ProjectRoot

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $ProjectRoot 'edge-agent\config.json'
}

$tsxPath = Join-Path $ProjectRoot 'node_modules\.bin\tsx.cmd'
if (-not (Test-Path $tsxPath)) {
  throw "tsx.cmd nao encontrado em $tsxPath. Execute npm install antes de iniciar o edge-agent."
}

Write-Host "[EdgeAgent] ProjectRoot: $ProjectRoot"
Write-Host "[EdgeAgent] ConfigPath:  $ConfigPath"

& $tsxPath 'edge-agent\main.ts' 'run' '--config' $ConfigPath
exit $LASTEXITCODE
