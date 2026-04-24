const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist-edge');
const releaseDir = path.join(projectRoot, 'release-edge-win64');

console.log('[Build] Preparando ambiente...');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

console.log('[Build] Compilando e empacotando com ESBuild...');
execSync(`npx esbuild edge-agent/main.ts --bundle --platform=node --target=node18 --outfile=dist-edge/bundle.js`, {
  cwd: projectRoot,
  stdio: 'inherit'
});

console.log('[Build] Gerando executável .exe com PKG...');
execSync(`npx pkg dist-edge/bundle.js --targets node18-win-x64 --output release-edge-win64/IA-Cloud-Edge.exe`, {
  cwd: projectRoot,
  stdio: 'inherit'
});

console.log('[Build] Copiando arquivos de configuração e scripts de serviço...');
fs.copyFileSync(
  path.join(projectRoot, 'edge-agent', 'config.example.json'),
  path.join(releaseDir, 'config.json')
);

const installScript = `@echo off
echo ========================================================
echo Instalador do Servico IA Cloud Edge
echo ========================================================
echo.

:: Verifica privilegios de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] O script deve ser executado como Administrador!
    echo Clique com o botao direito e selecione "Executar como administrador".
    pause
    exit /b 1
)

set SERVICE_NAME=IA-Cloud-Edge
set EXE_PATH=%~dp0IA-Cloud-Edge.exe

echo Instalando %SERVICE_NAME%...
sc create %SERVICE_NAME% binPath= "%EXE_PATH% run --config ^"%~dp0config.json^"" start= auto
sc description %SERVICE_NAME% "IA Cloud Access - Integracao Local de Hardware (Edge Agent)"

echo.
echo Iniciando o servico...
sc start %SERVICE_NAME%

echo.
echo ========================================================
echo [SUCESSO] O agente foi instalado e iniciado!
echo ========================================================
pause
`;

fs.writeFileSync(path.join(releaseDir, 'instalar-servico.bat'), installScript, 'utf8');

const uninstallScript = `@echo off
echo ========================================================
echo Desinstalador do Servico IA Cloud Edge
echo ========================================================
echo.

:: Verifica privilegios de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] O script deve ser executado como Administrador!
    echo Clique com o botao direito e selecione "Executar como administrador".
    pause
    exit /b 1
)

set SERVICE_NAME=IA-Cloud-Edge

echo Parando %SERVICE_NAME%...
sc stop %SERVICE_NAME%
timeout /t 3 /nobreak >nul

echo Removendo %SERVICE_NAME%...
sc delete %SERVICE_NAME%

echo.
echo ========================================================
echo [SUCESSO] O servico foi removido com sucesso!
echo ========================================================
pause
`;

fs.writeFileSync(path.join(releaseDir, 'desinstalar-servico.bat'), uninstallScript, 'utf8');

console.log('[Build] Limpando arquivos temporários...');
fs.rmSync(distDir, { recursive: true, force: true });

console.log('');
console.log('✅ Build Concluído com Sucesso!');
console.log(`📂 Pasta de Distribuição gerada: ${releaseDir}`);
console.log('-> Esta pasta contém o .exe e os scripts para você enviar para a escola.');
