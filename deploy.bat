@echo off
title RISE SST — Deploy Automatico
color 0A
cls

echo.
echo  ##############################################
echo  #                                            #
echo  #        RISE SST  ^|  Deploy Automatico      #
echo  #                                            #
echo  ##############################################
echo.

:: ── Vai para a pasta do projeto ──
cd /d "C:\Users\Gustavo - SWG\Documents\Rise SST"
if errorlevel 1 (
    color 0C
    echo  [ERRO] Pasta nao encontrada!
    echo  Verifique: C:\Users\Gustavo - SWG\Documents\Rise SST
    pause
    exit /b 1
)

echo  Pasta: %CD%
echo.

:: ── Stage todos os arquivos ──
echo  [1/4]  Adicionando arquivos alterados...
git add -A
echo         OK
echo.

:: ── Commit com timestamp ──
echo  [2/4]  Criando commit...
set DATAHORA=%date:~6,4%-%date:~3,2%-%date:~0,2% %time:~0,5%
git commit -m "deploy: %DATAHORA%"
echo         OK
echo.

:: ── Push ──
echo  [3/4]  Enviando para GitHub/Vercel...
git push origin main
if errorlevel 1 (
    color 0C
    echo.
    echo  [ERRO] Push falhou. Verifique conexao ou credenciais Git.
    pause
    exit /b 1
)
echo         OK — Vercel vai processar em instantes.
echo.

:: ── Countdown ──
echo  [4/4]  Aguardando build da Vercel...
echo.
echo  +----------------------------------+
echo  ^|  O sistema abre automaticamente  ^|
echo  ^|  apos a contagem regressiva      ^|
echo  +----------------------------------+
echo.

set /a SECS=60
:LOOP
if %SECS%==0 goto OPEN
set /p =  Abrindo em %SECS%s...                  <nul
echo.
timeout /t 1 /nobreak >nul
set /a SECS=%SECS%-1
:: Move para linha anterior via ANSI (funciona no Win10+)
echo [1A[2K
goto LOOP

:OPEN
cls
color 0B
echo.
echo  ##############################################
echo  #                                            #
echo  #    Deploy OK! Abrindo RISE SST...          #
echo  #                                            #
echo  ##############################################
echo.

start "" "https://risesst.vercel.app"

timeout /t 3 /nobreak >nul
exit
