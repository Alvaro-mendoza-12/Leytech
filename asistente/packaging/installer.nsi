; Compatibility wrapper for the updater in Leytech Asistente 1.1.0.
; Windows Installer owns all installation and uninstallation actions.
Unicode true
Name "Leytech Asistente"
OutFile "${OUTPUT}"
Icon "${APP_ICON}"
RequestExecutionLevel user
SilentInstall silent
SetCompress off
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "Leytech Asistente"
VIAddVersionKey "FileDescription" "Actualizador de Leytech Asistente"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName" "Leytech"
VIAddVersionKey "LegalCopyright" "Leytech"

!include "x64.nsh"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Este instalador requiere Windows de 64 bits."
    Abort
  ${EndIf}
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION "Se instalará Leytech Asistente ${APP_VERSION} con Windows Installer. Cierra el asistente antes de continuar." IDOK continue_install
  Abort
  continue_install:
FunctionEnd

Section
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=Leytech-Asistente-Windows-x64.msi "${APP_MSI}"
  ClearErrors
  ExecWait '"$SYSDIR\msiexec.exe" /i "$PLUGINSDIR\Leytech-Asistente-Windows-x64.msi" /passive /norestart' $0
  ${If} ${Errors}
    MessageBox MB_ICONSTOP "No se pudo abrir Windows Installer."
    SetErrorLevel 1
    Abort
  ${EndIf}
  ${If} $0 = 3010
    MessageBox MB_ICONINFORMATION "Reinicia Windows para completar la instalación."
  ${ElseIf} $0 != 0
  ${AndIf} $0 != 1602
    MessageBox MB_ICONSTOP "Windows Installer no pudo completar la instalación de Leytech (código $0)."
    SetErrorLevel $0
  ${EndIf}
SectionEnd
