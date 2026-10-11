$ErrorActionPreference = 'Stop'

$port = 8000
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://localhost:$port/index.html"

function Get-LocalHttpServerPid {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $connections) { return $null }

    foreach ($processId in ($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -match 'python|py') {
            return $processId
        }
    }

    return $null
}

$existingPid = Get-LocalHttpServerPid
if ($existingPid) {
    Write-Host "Le serveur est déjà lancé sur $url"
    Start-Process $url
    exit 0
}

$pythonCmd = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }
Write-Host "Démarrage du serveur local sur $url"
Start-Process -FilePath $pythonCmd -ArgumentList @('-m', 'http.server', $port, '--directory', $root) -WorkingDirectory $root -WindowStyle Hidden | Out-Null

Start-Sleep -Seconds 1
for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            Start-Process $url
            Write-Host "Le site est prêt : $url"
            exit 0
        }
    }
    catch {
        Start-Sleep -Seconds 1
    }
}

Write-Host "Le serveur a été démarré, mais le site n'a pas répondu immédiatement : $url"
