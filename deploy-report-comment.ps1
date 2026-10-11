$ErrorActionPreference = 'Stop'

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    throw 'Supabase CLI introuvable. Installe-le depuis https://supabase.com/docs/guides/cli, puis relance ce script.'
}

& supabase functions deploy report-comment --project-ref efdylqbvoqgmgfnzlqxj
if ($LASTEXITCODE -ne 0) {
    throw 'Le déploiement de la fonction report-comment a échoué.'
}

Write-Host 'Fonction report-comment déployée.'
