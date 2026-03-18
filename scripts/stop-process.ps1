# Encerra um processo pelo nome
param([string]$ProcessName)

$name = $ProcessName -replace '\.exe$', ''
Stop-Process -Name $name -Force -ErrorAction SilentlyContinue
exit 0
