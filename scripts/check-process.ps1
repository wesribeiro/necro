# Verifica se o processo está em execução
# Retorna 0 = rodando, 1 = não encontrado
param([string]$ProcessName)

$proc = Get-Process -Name ($ProcessName -replace '\.exe$', '') -ErrorAction SilentlyContinue
if ($proc) { exit 0 } else { exit 1 }
