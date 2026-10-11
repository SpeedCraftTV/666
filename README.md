# Mini Castor — blog rétro

Ce dépôt contient le blog rétro de Mini Castor, un castor futé, entrepreneur et passionné par les pommes, les tirelires et les bonnes négociations.

Fichiers principaux :
-- `index.html` - page d'accueil
-- `about.html` - présentation de Mini Castor
-- `contact.html` - formulaire de contact
-- `styles.css` - styles retro
-- `script.js` - compteur de visiteurs et formulaire de contact
-- `assets/beaver.svg` - portrait et icône de Mini Castor
-- `comments.html` et `comments.js` - commentaires, votes et signalements
-- `comments-config.js` et `supabase-setup.sql` - configuration du stockage Supabase

Pour l'utiliser, les pages statiques peuvent être ouvertes directement. Les archives et les commentaires partagés demandent toutefois un serveur web.

Pour lancer rapidement le site localement dans VS Code :
1. ouvre la palette de commandes et lance `Tasks: Run Task` puis `Serve blog local`, ou
2. lance `Run and Debug` puis `Ouvrir le blog`.

Le serveur tourne sur `http://localhost:8000` et peut être relancé manuellement après un redémarrage de VS Code avec la même commande. Le script `start-local-server.ps1` démarre le site en tâche de fond sans fenêtre visible et ouvre automatiquement le navigateur.

## publication gratuite avec GitHub Pages

le depot doit etre public pour utiliser GitHub Pages gratuitement. apres activation de **Settings → Pages → Build and deployment → GitHub Actions**, chaque push sur `main` publie automatiquement le site à l'adresse `https://speedcrafttv.github.io/666/`. le workflow ne publie que les pages, styles, scripts, images et archives du site ; les scripts locaux et les sources Supabase ne sont pas inclus.

## commentaires partagés

les commentaires, votes et signalements utilisent Supabase :

1. cree un projet Supabase.
2. ouvre `supabase-setup.sql` dans l'editeur SQL du projet et execute le script. Si tu l'as deja lancé, relance-le pour créer les colonnes de signalement et les permissions mises à jour.
3. dans `comments-config.js`, remplace `url` et `anonKey` par l'URL du projet et sa clé `anon` publique. ne mets jamais une clé `service_role` dans le site.
4. cree un compte Resend et verifie le domaine qui servira a envoyer les e-mails.
5. dans **Supabase → Edge Functions → Secrets**, ajoute `RESEND_API_KEY` (cle API Resend), `RESEND_FROM_EMAIL` (expediteur sur le domaine verifie, ex. `Blog <signalements@speedcrafttv.com>`), `REPORTS_INBOX_EMAIL` (adresse qui recoit les signalements) et `RATE_LIMIT_SECRET` (une valeur aleatoire longue). Ne publie jamais ces valeurs dans le depot. Supabase fournit automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` aux fonctions.
6. installe les dependances du depot avec `npm install` ; la CLI Supabase est incluse localement. Dans PowerShell, lance `.\node_modules\.bin\supabase.cmd login`, puis execute `.\deploy-report-comment.ps1` depuis la racine du depot. Si Node.js n'est pas reconnu dans ce terminal, ajoute son dossier au PATH (installation standard : `$env:Path = "C:\Program Files\nodejs;$env:Path"`). Le script de deploiement detecte aussi cette installation standard. Il publie `report-comment` sur le projet configure dans `supabase/config.toml`.
7. ouvre le site publie sur GitHub Pages et teste un signalement. La fonction applique ses validations et une limite d'un envoi par adresse IP par minute ; un signalement valide est enregistre puis envoie un e-mail a l'adresse de reception et une copie au signalant.

### formulaire de contact

Le formulaire envoie le nom, l'adresse e-mail et le message à `minicastorbot@gmail.com` via une fonction Supabase Edge et Resend. Le message reste privé et l'adresse saisie sert uniquement d'adresse de réponse. La fonction réutilise `RESEND_API_KEY`, `RESEND_FROM_EMAIL` et `RATE_LIMIT_SECRET` déjà configurés ci-dessus ; aucun secret n'est ajouté au site.

Après l'authentification de la CLI locale (`.\node_modules\.bin\supabase.cmd login`), exécute `.\deploy-contact-message.ps1` à la racine pour publier `contact-message`. Aucun SQL supplémentaire n'est requis : elle réutilise la limite d'envoi par adresse IP créée par `supabase-setup.sql`. Le formulaire confirme l'envoi seulement si Resend l'accepte ; sinon, il affiche une erreur et conserve le message saisi. L'envoi réel nécessite cette fonction déployée et les secrets Resend configurés.

N'ouvre pas `contact.html` directement depuis l'explorateur (`file://`) : le navigateur bloque les appels réseau de cette page. Lance le serveur local du dépôt, puis ouvre `http://localhost:8000/contact.html`, `http://127.0.0.1:8765/contact.html` ou `http://127.0.0.1:5500/contact.html` (Live Server dans VS Code). Si le formulaire répond que le service n'est pas déployé, déploie `contact-message` avec le script ci-dessus et publie ensuite les changements du site sur GitHub Pages.

### comptes visiteurs

la lecture du site et des commentaires reste publique. pour commenter, répondre, voter ou signaler, il faut creer un compte avec un pseudo, une adresse e-mail et un mot de passe, ou se connecter avec Google ou Discord. la page `account.html` permet de gérer et de délier les identités Google et Discord reliées. l'adresse de compte est utilisée pour envoyer la copie d'un signalement.

pour activer les comptes sur un projet deja en service, suis cet ordre :

1. relance `supabase-setup.sql` dans l'editeur SQL Supabase pour ajouter les colonnes utilisateur et restreindre les commentaires, votes et signalements aux comptes connectes. ce script crée également la table des réponses et les permissions nécessaires. les anciens commentaires et votes restent visibles.
2. dans **Authentication → URL Configuration**, definis l'URL du site sur `https://speedcrafttv.github.io/666/` et autorise les redirections `https://speedcrafttv.github.io/666/**` et `http://localhost:8000/**`. si le site utilise un domaine personnalise, remplace cette URL par son adresse HTTPS et autorise aussi `https://ton-domaine/**`. dans `comments-config.js`, mets la meme adresse dans `siteUrl`. les liens de confirmation et le retour Google utilisent cette adresse (meme si l'inscription a ete faite en local).
3. pour que les nouveaux membres recoivent leur confirmation par e-mail, configure un SMTP personnalise dans **Authentication → SMTP Settings** (Resend : serveur `smtp.resend.com`, port `465` ou `587`, utilisateur `resend`, mot de passe = cle API Resend, expediteur sur le domaine verifie). garde cette cle dans les parametres Supabase, jamais dans le code.
4. dans **Authentication → Sign In / Providers → User Signups**, active **Allow manual linking**, puis clique sur **Save changes**. cette option (beta) autorise la liaison et la déliaison manuelles des comptes Google et Discord depuis la page Compte. pour éviter de perdre l'accès, le site empêche de délier la dernière identité reliée.
5. pour activer Google, cree un **OAuth Client ID** de type application Web dans Google Cloud Console. ajoute comme URI de redirection autorisee `https://efdylqbvoqgmgfnzlqxj.supabase.co/auth/v1/callback` (l'URL de rappel Supabase du projet). copie le Client ID et le Client Secret dans **Supabase → Authentication → Providers → Google**, active le fournisseur, puis enregistre. ne mets pas le secret Google dans les fichiers du site.
6. pour activer Discord, cree une application dans le [Discord Developer Portal](https://discord.com/developers/applications), puis ouvre **OAuth2**. ajoute `https://efdylqbvoqgmgfnzlqxj.supabase.co/auth/v1/callback` comme redirect URI et enregistre. copie l'Application ID et le Client Secret dans **Supabase → Authentication → Providers → Discord**, active le fournisseur, puis enregistre. le site demande les scopes `identify email`; Discord doit fournir une adresse e-mail verifiee pour permettre l'envoi de signalements.
7. depuis la racine du depot, redeploie la fonction mise a jour avec `.\deploy-report-comment.ps1` ; ses secrets Resend existants restent en place.
8. publie ensuite les changements du site sur `main` pour activer les boutons. le deploiement automatique actuel publiera les changements lors du push.

les utilisateurs de l'ancien site peuvent creer un compte ; les anciens commentaires et votes restent visibles, mais leur historique de vote ne peut pas etre rattache a un compte.

les commentaires et réponses sont publics et publiés immédiatement. jusqu'à trois réponses sont affichées sous chaque commentaire ; à partir de quatre, un lien ouvre `replies.html` avec toute la discussion et un accès direct à l'accueil. un signalement est conservé dans `blog_comment_reports`, envoyé à l'adresse de réception et une copie est envoyée à l'adresse du compte qui l'a soumis. informe les visiteurs de cet usage de leurs données et définis une durée de conservation adaptée. chaque compte ne peut voter et signaler qu'une fois par commentaire.

Idées pour la suite :
- ajouter d'autres aventures de Mini Castor
- enrichir les illustrations et les icônes rétro

Amuse-toi bien !