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
4. cree un compte Resend et verifie le domaine qui servira a envoyer les e-mails.
5. dans **Supabase → Edge Functions → Secrets**, ajoute `RESEND_API_KEY` (cle API Resend), `RESEND_FROM_EMAIL` (expediteur sur le domaine verifie, ex. `Blog <signalements@ton-domaine.fr>`), `REPORTS_INBOX_EMAIL` (adresse qui recoit les signalements) et `RATE_LIMIT_SECRET` (une valeur aleatoire longue). Ne publie jamais ces valeurs dans le depot. Supabase fournit automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` aux fonctions.
6. installe la [CLI Supabase](https://supabase.com/docs/guides/cli), lance `supabase login` dans un terminal local, puis execute `.\deploy-report-comment.ps1` depuis la racine du depot. Le script publie la fonction `report-comment` sur le projet configure dans `supabase/config.toml`.
7. ouvre le site publie sur GitHub Pages et teste un signalement. La fonction applique ses validations et une limite d'un envoi par adresse IP par minute ; un signalement valide est enregistre puis envoie un e-mail a l'adresse de reception et une copie au signalant.

les commentaires sont publics et publiés immédiatement. le formulaire de signalement demande un pseudo, un e-mail et une explication ; le signalement est conservé dans `blog_comment_reports`, envoyé à l'adresse de réception et une copie est envoyée au signalant. informe les visiteurs de cet usage de leurs données et définis une durée de conservation adaptée. chaque navigateur ne peut voter qu'une fois par commentaire (effacer les données du navigateur peut réinitialiser cette limite).

ameliorations possibl:
- ajouter des pages d'articles encore plus kikoo
- ajouter un backend pour recevoir de vrai messages (ou pas)
- mettre des gifs animés et plein d'icones 16x16

amuse toi bien ♥ (fautes garanties)