$ErrorActionPreference = 'Stop'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    $nodeDirectories = @()
    if ($env:ProgramFiles) {
        $nodeDirectories += Join-Path $env:ProgramFiles 'nodejs'
    }
    if ($env:LOCALAPPDATA) {
        $nodeDirectories += Join-Path $env:LOCALAPPDATA 'Programs\nodejs'
    }

    $nodeDirectory = $nodeDirectories |
        Where-Object { Test-Path (Join-Path $_ 'node.exe') } |
        Select-Object -First 1
    if ($nodeDirectory) {
        $env:Path = "$nodeDirectory;$env:Path"
    }
}

$supabaseCommand = Get-Command supabase -ErrorAction SilentlyContinue
$localSupabaseCli = Join-Path $PSScriptRoot 'node_modules\.bin\supabase.cmd'

if ($supabaseCommand) {
    & supabase functions deploy report-comment --project-ref efdylqbvoqgmgfnzlqxj
}
elseif (Test-Path $localSupabaseCli) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js est introuvable. Ajoute le dossier contenant node.exe au PATH, puis relance ce script.'
    }
    & $localSupabaseCli functions deploy report-comment --project-ref efdylqbvoqgmgfnzlqxj
}
else {
    throw 'Supabase CLI introuvable. Installe les dépendances du projet avec npm install.'
}

if ($LASTEXITCODE -ne 0) {
    throw 'Le déploiement de la fonction report-comment a échoué.'
}

Write-Host 'Fonction report-comment déployée.'
