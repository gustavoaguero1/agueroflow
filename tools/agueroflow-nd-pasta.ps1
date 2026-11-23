# AgueroFlow -> pasta de rede do financeiro
# Busca as NDs novas no AgueroFlow e salva o PDF em <Destino>\<aaaa>\<mm>.<aaaa>\<dd>.<mm>\
# Instalação: veja docs/nd-pasta-rede.md
param(
  [string]$Servidor = "https://SEU-APP.run.app",                                  # endereço do AgueroFlow (sem / no fim)
  [string]$Destino  = "\\192.168.88.12\Financeiro - NDs a pagar",                 # pasta raiz do financeiro
  [string]$Token    = $env:AGUEROFLOW_ND_TOKEN                                     # mesma chave do Secret ND_EXPORT_TOKEN
)
$ErrorActionPreference = "Stop"
$log = Join-Path $env:LOCALAPPDATA "agueroflow-nd-pasta.log"
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Out-File -Append -Encoding utf8 $log }

if (-not $Token) { Log "ERRO: defina a variável AGUEROFLOW_ND_TOKEN"; exit 1 }
$h = @{ "x-nd-export-token" = $Token }
try {
  $pendentes = Invoke-RestMethod -Uri "$Servidor/api/nd-export/pendentes" -Headers $h -TimeoutSec 60
} catch { Log "ERRO ao consultar pendentes: $($_.Exception.Message)"; exit 1 }

foreach ($nd in @($pendentes)) {
  try {
    $pasta = Join-Path $Destino $nd.folder
    New-Item -ItemType Directory -Force -Path $pasta | Out-Null          # cria ano, mês e dia se faltarem
    $nome = ($nd.fileName -replace '[\\/:*?"<>|]', '-')
    $arquivo = Join-Path $pasta $nome
    Invoke-WebRequest -Uri "$Servidor/api/nd-export/$($nd.id)/pdf" -Headers $h -OutFile $arquivo -TimeoutSec 120
    Invoke-RestMethod -Method Post -Uri "$Servidor/api/nd-export/$($nd.id)/salvo" -Headers $h `
      -ContentType "application/json" -Body (@{ revision = $nd.revision } | ConvertTo-Json) | Out-Null
    Log "OK  $arquivo"
  } catch { Log "ERRO na ND $($nd.id): $($_.Exception.Message) (tenta de novo na próxima rodada)" }
}
