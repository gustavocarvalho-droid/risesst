$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " DEV SWG - Deploy automatico" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "ERRO: Git nao encontrado. Instale o Git." -ForegroundColor Red
  pause
  exit 1
}

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  git remote add origin "https://github.com/gustavocarvalho-droid/dev-swg.git"
}

git status --short

$commitMsg = Read-Host "Mensagem do deploy ou ENTER para automatica"
if ([string]::IsNullOrWhiteSpace($commitMsg)) {
  $commitMsg = "Gerador template-first funcionando - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
}

git add .
$changes = git status --porcelain

if ([string]::IsNullOrWhiteSpace($changes)) {
  Write-Host "Nenhuma alteracao para enviar." -ForegroundColor Yellow
  pause
  exit 0
}

git commit -m "$commitMsg"
git branch -M main
git push -u origin main

Write-Host ""
Write-Host "Deploy enviado. Aguarde a Vercel finalizar." -ForegroundColor Green
Write-Host "Teste: https://dev-swg.vercel.app/api/generate" -ForegroundColor Cyan
pause
