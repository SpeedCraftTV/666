$ErrorActionPreference = 'Stop'

$supabaseCommand = Get-Command supabase -ErrorAction SilentlyContinue
$localSupabaseCli = Join-Path $PSScriptRoot 'node_modules\.bin\supabase.cmd'

if ($supabaseCommand) {
    & supabase functions deploy report-comment --project-ref efdylqbvoqgmgfnzlqxj
}
elseif (Test-Path $localSupabaseCli) {
    & $localSupabaseCli functions deploy report-comment --project-ref efdylqbvoqgmgfnzlqxj
}
else {
    throw 'Supabase CLI introuvable. Installe-le depuis https://supabase.com/docs/guides/cli ou avec npm install --save-dev supabase.'
}

if ($LASTEXITCODE -ne 0) {
    throw 'Le déploiement de la fonction report-comment a échoué.'
}

Write-Host 'Fonction report-comment déployée.'
