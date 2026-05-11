# ============================================================
#   RISE SST — Deploy Automatico v2
#   Execute: clique direito > "Executar com PowerShell"
# ============================================================

$Host.UI.RawUI.WindowTitle = "RISE SST — Deploy"
$projectPath = "C:\Users\Gustavo - SWG\Documents\Rise SST"
$siteUrl     = "https://risesst.vercel.app"
$waitSeconds = 60

function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║        RISE SST  |  Deploy Automatico    ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-OK   { Write-Host "         ✓ OK" -ForegroundColor Green }
function Write-Fail($msg) {
    Write-Host "         ✗ ERRO: $msg" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Pressione Enter para sair"
    exit 1
}

Write-Header

# ── Verificar pasta ──
if (-not (Test-Path $projectPath)) { Write-Fail "Pasta nao encontrada: $projectPath" }
Set-Location $projectPath
Write-Host "  Pasta: " -NoNewline -ForegroundColor DarkGray
Write-Host $projectPath -ForegroundColor Gray

# ── Verificar arquivo index.html ──
Write-Host ""
Write-Host "  Verificando index.html..." -ForegroundColor Yellow
$indexPath = Join-Path $projectPath "index.html"
if (-not (Test-Path $indexPath)) {
    Write-Fail "index.html nao encontrado em $projectPath"
}
$fileInfo = Get-Item $indexPath
$fileSizeKB = [math]::Round($fileInfo.Length / 1KB, 1)
$lastModified = $fileInfo.LastWriteTime.ToString("dd/MM/yyyy HH:mm:ss")

Write-Host "         Tamanho: $fileSizeKB KB" -ForegroundColor Gray
Write-Host "         Modificado: $lastModified" -ForegroundColor Gray

# Warn if file seems too small (should be > 500KB)
if ($fileInfo.Length -lt 500000) {
    Write-Host ""
    Write-Host "  ⚠️  ATENÇÃO: index.html parece menor que o esperado ($fileSizeKB KB)" -ForegroundColor Yellow
    Write-Host "     O arquivo esperado tem ~680 KB" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "  Deseja continuar mesmo assim? (s/N)"
    if ($confirm -ne 's' -and $confirm -ne 'S') { exit 0 }
}
Write-OK

# ── Git status ──
Write-Host ""
Write-Host "  Arquivos alterados:" -ForegroundColor Yellow
$status = git status --short 2>&1
if ($status) {
    $status | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
} else {
    Write-Host "    (nenhuma alteracao detectada)" -ForegroundColor DarkGray
    Write-Host ""
    $force = Read-Host "  Nao ha alteracoes. Forcar deploy? (s/N)"
    if ($force -ne 's' -and $force -ne 'S') {
        Write-Host ""
        Write-Host "  Deploy cancelado." -ForegroundColor Yellow
        Start-Sleep 2; exit 0
    }
}

# ── Git add ──
Write-Host ""
Write-Host "  [1/3] Adicionando arquivos..." -ForegroundColor Yellow
git add -A 2>&1 | Out-Null
Write-OK

# ── Git commit ──
Write-Host ""
Write-Host "  [2/3] Criando commit..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$result = git commit -m "deploy: $timestamp" 2>&1
if ($LASTEXITCODE -ne 0 -and ($result -match "nothing to commit")) {
    Write-Host "         (sem alteracoes novas)" -ForegroundColor DarkGray
} else {
    Write-OK
}

# ── Git push ──
Write-Host ""
Write-Host "  [3/3] Enviando para Vercel..." -ForegroundColor Yellow
git push origin main 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Push falhou. Verifique conexao ou credenciais." }
Write-OK

# ── Countdown ──
Write-Host ""
Write-Host "  ┌──────────────────────────────────────────┐" -ForegroundColor DarkCyan
Write-Host "  │  Aguardando build da Vercel (~45s)        │" -ForegroundColor DarkCyan
Write-Host "  │  O site abrira automaticamente!           │" -ForegroundColor DarkCyan
Write-Host "  └──────────────────────────────────────────┘" -ForegroundColor DarkCyan
Write-Host ""

$barWidth = 40
for ($i = $waitSeconds; $i -ge 0; $i--) {
    $filled = [int](($waitSeconds - $i) / $waitSeconds * $barWidth)
    $empty  = $barWidth - $filled
    $bar    = "█" * $filled + "░" * $empty
    $pct    = [int](($waitSeconds - $i) / $waitSeconds * 100)
    $color  = if ($i -gt 30) { "DarkGray" } elseif ($i -gt 10) { "Yellow" } else { "Green" }
    Write-Host "`r  [$bar] $pct%  ($i"+"s)   " -NoNewline -ForegroundColor $color
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host ""
Clear-Host
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║         ✓  Deploy Concluido!             ║" -ForegroundColor Green
Write-Host "  ║         Abrindo RISE SST...              ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  URL: $siteUrl" -ForegroundColor Cyan
Write-Host ""

Start-Process $siteUrl
Start-Sleep -Seconds 2
