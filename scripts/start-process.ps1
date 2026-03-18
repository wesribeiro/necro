# Inicia um processo pelo caminho completo do executável
param([string]$ExecPath)

Start-Process -FilePath $ExecPath -WindowStyle Normal
exit 0
