@echo off
title RISE SST — Deploy Automatico
color 1F
chcp 65001 >nul

echo.
echo  =====================================================
echo    ///  RISE SST  —  Deploy Automatico para Vercel
echo  =====================================================
echo.

REM -- Vai para a pasta do projeto
cd /d "C:\Users\Gustavo - SWG\Documents\Rise SST"

if not exist ".git" (
    echo  [ERRO] Pasta sem repositorio Git. Verifique o caminho.
    pause
    exit /b 1
)

if not exist "index.html" (
    echo  [ERRO] index.html nao encontrado na pasta.
    pause
    exit /b 1
)

echo  [1/3] Registrando mudancas...
git add index.html
if %errorlevel% neq 0 (
    echo  [ERRO] Falha no git add. Verifique o Git.
    pause
    exit /b 1
)

echo  [2/3] Criando commit com data/hora...
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set dt=%%a
set TIMESTAMP=%dt:~0,4%-%dt:~4,2%-%dt:~6,2% %dt:~8,2%:%dt:~10,2%
git commit -m "deploy: %TIMESTAMP%"
if %errorlevel% neq 0 (
    echo  [AVISO] Nada para commitar - arquivo pode nao ter mudado.
    echo  Verifique se substituiu o index.html antes de rodar este script.
    pause
    exit /b 0
)

echo  [3/3] Enviando para GitHub / Vercel...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo  [ERRO] Falha no push. Possiveis causas:
    echo    - Token do GitHub expirado
    echo    - Sem conexao com a internet
    echo.
    echo  Solucao: gere novo token em:
    echo  github.com - Settings - Developer settings - Personal access tokens
    pause
    exit /b 1
)

echo.
echo  =====================================================
echo    Codigo enviado com sucesso!
echo    A Vercel esta fazendo o deploy automatico...
echo  =====================================================
echo.

REM -- Contagem regressiva de 60 segundos
echo  Aguarde 60 segundos para o deploy concluir...
echo.

for /L %%i in (60,-1,1) do (
    if %%i==60 echo  60 segundos...
    if %%i==45 echo  45 segundos...
    if %%i==30 echo  30 segundos...
    if %%i==15 echo  15 segundos...
    if %%i==10 echo  10 segundos...
    if %%i==5  echo  5 segundos...
    if %%i==4  echo  4...
    if %%i==3  echo  3...
    if %%i==2  echo  2...
    if %%i==1  echo  1...
    timeout /t 1 /nobreak >nul
)

echo.
echo  Abrindo RISE SST no navegador...
start https://risesst.vercel.app

echo.
echo  =====================================================
echo    Deploy concluido! Pressione qualquer tecla para sair.
echo  =====================================================
echo.
pause
