# ============================================================
#   RISE SST — Deploy Automatico
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

function Write-Step($num, $total, $msg) {
    Write-Host "  [$num/$total] " -NoNewline -ForegroundColor Yellow
    Write-Host $msg -ForegroundColor White
}

function Write-OK { Write-Host "         ✓ OK" -ForegroundColor Green }
function Write-Fail($msg) { 
    Write-Host "         ✗ ERRO: $msg" -ForegroundColor Red 
    Write-Host ""
    Read-Host "  Pressione Enter para sair"
    exit 1
}

# ── Start ──
Write-Header

# ── Check folder ──
if (-not (Test-Path $projectPath)) {
    Write-Fail "Pasta nao encontrada: $projectPath"
}
Set-Location $projectPath
Write-Host "  Pasta: " -NoNewline -ForegroundColor DarkGray
Write-Host $projectPath -ForegroundColor Gray
Write-Host ""

# ── Git add ──
Write-Step 1 4 "Adicionando arquivos alterados..."
git add -A 2>&1 | Out-Null
Write-OK

# ── Git commit ──
Write-Step 2 4 "Criando commit..."
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$commitMsg = "deploy: $timestamp"
$result = git commit -m $commitMsg 2>&1
if ($LASTEXITCODE -ne 0 -and $result -notmatch "nothing to commit") {
    Write-Host "         (sem alteracoes novas — ok)" -ForegroundColor DarkGray
} else {
    Write-OK
}

# ── Git push ──
Write-Step 3 4 "Enviando para GitHub / Vercel..."
git push origin main 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Push falhou. Verifique conexao ou credenciais."
}
Write-OK

# ── Countdown ──
Write-Step 4 4 "Aguardando Vercel processar o build..."
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────┐" -ForegroundColor DarkCyan
Write-Host "  │  Vercel leva ~45s para publicar o build  │" -ForegroundColor DarkCyan
Write-Host "  │  O site vai abrir automaticamente!       │" -ForegroundColor DarkCyan
Write-Host "  └─────────────────────────────────────────┘" -ForegroundColor DarkCyan
Write-Host ""

$barWidth = 40
for ($i = $waitSeconds; $i -ge 0; $i--) {
    $pct     = [int](($waitSeconds - $i) / $waitSeconds * 100)
    $filled  = [int](($waitSeconds - $i) / $waitSeconds * $barWidth)
    $empty   = $barWidth - $filled
    $bar     = "█" * $filled + "░" * $empty
    
    $color = if ($i -gt 30) { "DarkGray" } elseif ($i -gt 10) { "Yellow" } else { "Green" }
    
    Write-Host "`r  [$bar] $pct%  ($i"+"s)   " -NoNewline -ForegroundColor $color
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host ""

# ── Open site ──
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
