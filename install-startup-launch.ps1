$ErrorActionPreference = 'Stop'

$startupFolder = [Environment]::GetFolderPath('Startup')
$scriptPath = Join-Path $PSScriptRoot 'start-local-server.ps1'
$shortcutPath = Join-Path $startupFolder 'Blog local.lnk'

if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = 'powershell.exe'
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '"'
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Save()

Write-Host "Raccourci ajouté dans le dossier Démarrage : $startupFolder"
Write-Host "Le site se lancera automatiquement au prochain démarrage Windows."
