$ErrorActionPreference = 'Stop'

$supabaseCommand = Get-Command supabase -ErrorAction SilentlyContinue
$localSupabaseCli = Join-Path $PSScriptRoot 'node_modules\.bin\supabase.cmd'

if ($supabaseCommand) {
    & supabase functions deploy contact-message --project-ref efdylqbvoqgmgfnzlqxj
}
elseif (Test-Path $localSupabaseCli) {
    & $localSupabaseCli functions deploy contact-message --project-ref efdylqbvoqgmgfnzlqxj
}
else {
    throw 'Supabase CLI introuvable. Installe-le depuis https://supabase.com/docs/guides/cli ou avec npm install --save-dev supabase.'
}

if ($LASTEXITCODE -ne 0) {
    throw 'Le déploiement de la fonction contact-message a échoué.'
}

Write-Host 'Fonction contact-message déployée.'
