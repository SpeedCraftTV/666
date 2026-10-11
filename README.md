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
5. dans **Supabase → Edge Functions → Secrets**, ajoute `RESEND_API_KEY` (cle API Resend), `RESEND_FROM_EMAIL` (expediteur sur le domaine verifie, ex. `Blog <signalements@speedcrafttv.com>`), `REPORTS_INBOX_EMAIL` (adresse qui recoit les signalements) et `RATE_LIMIT_SECRET` (une valeur aleatoire longue). Ne publie jamais ces valeurs dans le depot. Supabase fournit automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` aux fonctions.
6. installe la [CLI Supabase](https://supabase.com/docs/guides/cli), lance `supabase login` dans un terminal local, puis execute `.\deploy-report-comment.ps1` depuis la racine du depot. Le script publie la fonction `report-comment` sur le projet configure dans `supabase/config.toml`.
7. ouvre le site publie sur GitHub Pages et teste un signalement. La fonction applique ses validations et une limite d'un envoi par adresse IP par minute ; un signalement valide est enregistre puis envoie un e-mail a l'adresse de reception et une copie au signalant.

### comptes visiteurs

la lecture du site et des commentaires reste publique. pour commenter, voter ou signaler, il faut creer un compte avec un pseudo, une adresse e-mail et un mot de passe. l'adresse de compte est utilisée pour envoyer la copie d'un signalement.

pour activer les comptes sur un projet deja en service, suis cet ordre :

1. relance `supabase-setup.sql` dans l'editeur SQL Supabase pour ajouter les colonnes utilisateur et restreindre les commentaires, votes et signalements aux comptes connectes. les anciens commentaires et votes restent visibles.
2. dans **Authentication → URL Configuration**, definis l'URL du site sur `https://speedcrafttv.github.io/666/` et autorise les redirections `https://speedcrafttv.github.io/666/**` et `http://localhost:8000/**`.
3. pour que les nouveaux membres recoivent leur confirmation par e-mail, configure un SMTP personnalise dans **Authentication → SMTP Settings** (Resend : serveur `smtp.resend.com`, port `465` ou `587`, utilisateur `resend`, mot de passe = cle API Resend, expediteur sur le domaine verifie). garde cette cle dans les parametres Supabase, jamais dans le code.
4. depuis la racine du depot, redeploie la fonction mise a jour avec `.\deploy-report-comment.ps1` ; ses secrets Resend existants restent en place.
5. publie ensuite les changements du site sur `main` pour que GitHub Pages active les formulaires de compte. le deploiement automatique actuel publiera les changements lors du push.

les utilisateurs de l'ancien site peuvent creer un compte ; les anciens commentaires et votes restent visibles, mais leur historique de vote ne peut pas etre rattache a un compte.

les commentaires sont publics et publiés immédiatement. un signalement est conservé dans `blog_comment_reports`, envoyé à l'adresse de réception et une copie est envoyée à l'adresse du compte qui l'a soumis. informe les visiteurs de cet usage de leurs données et définis une durée de conservation adaptée. chaque compte ne peut voter et signaler qu'une fois par commentaire.

ameliorations possibl:
- ajouter des pages d'articles encore plus kikoo
- ajouter un backend pour recevoir de vrai messages (ou pas)
- mettre des gifs animés et plein d'icones 16x16

amuse toi bien ♥ (fautes garanties)