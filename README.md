# blog retro (old-school)

ce depot contien mon ptit blog super retro en html/css/js, ecris come par un kikoo pour le fun lol 😜

fichiers principaux:
-- `index.html` - page d'acceuil (kikoo)
-- `about.html` - a propros
-- `contact.html` - page de contakt (formulaire bidon)
-- `styles.css` - styles retro
-- `script.js` - js minimal (compteur visiteurs + form qui dit kikoo)
-- `assets/placeholder.svg` - image placéholder
-- `comments.html` et `comments.js` - commentaires, votes et signalements
-- `comments-config.js` et `supabase-setup.sql` - configuration du stockage Supabase

pour l'utiliser, les pages statiques peuvent etre ouvertes directement. les archives et les commentaires partagés demandent toutefois un serveur web.

pour lancer rapidement le site localement dans VS Code :
1. ouvre la palette de commandes et lance `Tasks: Run Task` puis `Serve blog local`, ou
2. lance `Run and Debug` puis `Ouvrir le blog`.

le serveur tourne sur `http://localhost:8000` et peut etre relance manuellement apres un redemarrage de VS Code avec la meme commande. le script `start-local-server.ps1` demarre le site en tache de fond sans fenetre visible et ouvre automatiquement le navigateur.

## publication gratuite avec GitHub Pages

le depot doit etre public pour utiliser GitHub Pages gratuitement. apres activation de **Settings → Pages → Build and deployment → GitHub Actions**, chaque push sur `main` publie automatiquement le site à l'adresse `https://speedcrafttv.github.io/666/`. le workflow ne publie que les pages, styles, scripts, images et archives du site ; les scripts locaux et les sources Supabase ne sont pas inclus.

## commentaires partagés

les commentaires, votes et signalements utilisent Supabase :

1. cree un projet Supabase.
2. ouvre `supabase-setup.sql` dans l'editeur SQL du projet et execute le script. Si tu l'as deja lancé, relance-le pour créer les colonnes de signalement et les permissions mises à jour.
3. dans `comments-config.js`, remplace `url` et `anonKey` par l'URL du projet et sa clé `anon` publique. ne mets jamais une clé `service_role` dans le site.
4. cree un compte Resend, verifie un domaine d'envoi et ajoute ces secrets dans **Supabase → Edge Functions → Secrets** : `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (ex. `Blog <signalements@ton-domaine.fr>`), `REPORTS_INBOX_EMAIL` (adresse qui reçoit les signalements) et `RATE_LIMIT_SECRET` (une longue valeur aleatoire). Supabase fournit automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` aux fonctions.
5. installe la CLI Supabase, puis depuis ce depot lance `supabase link --project-ref efdylqbvoqgmgfnzlqxj` et `supabase functions deploy report-comment`. `supabase/config.toml` configure cette fonction comme point d'entree public ; elle applique ses propres validations et une limite d'un envoi par adresse IP par minute.
6. publie le site sur un serveur HTTPS (ou utilise un serveur local pour tester), puis ouvre `comments.html`.

les commentaires sont publics et publiés immédiatement. le formulaire de signalement demande un pseudo, un e-mail et une explication ; le signalement est conservé dans `blog_comment_reports`, envoyé à l'adresse de réception et une copie est envoyée au signalant. informe les visiteurs de cet usage de leurs données et définis une durée de conservation adaptée. chaque navigateur ne peut voter qu'une fois par commentaire (effacer les données du navigateur peut réinitialiser cette limite).

ameliorations possibl:
- ajouter des pages d'articles encore plus kikoo
- ajouter un backend pour recevoir de vrai messages (ou pas)
- mettre des gifs animés et plein d'icones 16x16

amuse toi bien ♥ (fautes garanties)