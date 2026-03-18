; ── NECRO — NSIS Custom Install/Uninstall ────────────────────────────────────
; Garante que o NECRO seja registrado para iniciar com o Windows
; em TODAS as máquinas em que for instalado, independente das configurações do app.

!macro customInstall
  ; Registra no Run key do usuário atual (não requer Admin)
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "NECRO" \
    '"$INSTDIR\NECRO.exe"'
!macroend

!macro customUninstall
  ; Remove do Run key ao desinstalar
  DeleteRegValue HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "NECRO"
!macroend
