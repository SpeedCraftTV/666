(function () {
  const config = window.BLOG_SUPABASE || {};
  const supabaseUrl = (config.url || '').replace(/\/$/, '');
  const anonKey = config.anonKey || '';
  const scriptUrl = document.currentScript?.src || window.location.href;
  const siteBaseUrl = new URL('.', scriptUrl);
  const productionSiteUrl = config.siteUrl || 'https://speedcrafttv.github.io/666/';
  const pendingIdentityLinkKey = 'blog-pending-identity-link';
  const replyPreviewLimit = 3;
  let authClient = null;
  let authSession = null;
  let currentUser = null;
  let currentIdentities = null;
  let accountIdentityError = '';
  let accountMessage = '';
  let myVotes = new Map();
  let archiveMaintenanceUserId = null;
  const accountPanels = new Set();
  const refreshCallbacks = new Set();
  const postTitles = {
    post1: 'Ma première tirelire',
    post2: 'L’atelier des bonnes affaires',
    post3: 'L’art de négocier sur le web',
    post4: 'La panne qui devint une occasion',
    post5: 'La collection qui vaut de l’or',
    post6: 'À la recherche du pixel perdu',
    post7: 'La négociation des mèmes',
    post8: 'La photo qui répondait',
    post9: 'La panne qui m’a appris à investir',
    post10: 'Le guide du petit entrepreneur',
    post11: 'Yaki et les hochets qui font dring',
    post12: 'Yuki et la note jamais réglée',
    post13: 'Toutou Yaki, le frère qui garde son calme',
    post14: 'Papa Speed et l’expérience qui faisait dring',
    post15: 'Neko, ma mère au caractère de chat',
  };

  function getPostUrl(postId) {
    return new URL(`posts/${encodeURIComponent(postId)}.html`, siteBaseUrl).href;
  }

  function getSiteRedirectUrl() {
    if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      return productionSiteUrl;
    }
    return siteBaseUrl.href;
  }

  function getAccountRedirectUrl() {
    const baseUrl = ['localhost', '127.0.0.1', '::1'].includes(
        window.location.hostname,
      )
      ? productionSiteUrl
      : siteBaseUrl.href;
    return new URL('account.html', baseUrl).href;
  }

  function getNickname(user) {
    const metadata = user?.user_metadata || {};
    const nickname = typeof metadata.nickname === 'string' ? metadata.nickname.trim() : '';
    const fallback = typeof user?.email === 'string' ? user.email.split('@')[0] : '';
    return (nickname || fallback).slice(0, 40);
  }

  function getVoterId() {
    const storageKey = `blog-comment-voter-id-${currentUser.id}`;
    let voterId = localStorage.getItem(storageKey);
    if (!voterId) {
      voterId = crypto.randomUUID();
      localStorage.setItem(storageKey, voterId);
    }
    return voterId;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
        ...(authSession?.access_token ? { Authorization: `Bearer ${authSession.access_token}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase (${response.status}): ${details}`);
    }
    const responseBody = await response.text();
    return responseBody ? JSON.parse(responseBody) : null;
  }

  function createStatus(container) {
    const status = document.createElement('p');
    status.className = 'comments-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    container.appendChild(status);
    return status;
  }

  function consumeOAuthError() {
    const url = new URL(window.location.href);
    const queryParams = url.searchParams;
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const errorCode = queryParams.get('error_code') ||
      queryParams.get('error') ||
      hashParams.get('error_code') ||
      hashParams.get('error');
    const description = queryParams.get('error_description') ||
      hashParams.get('error_description');
    if (!errorCode && !description) return null;

    ['error', 'error_code', 'error_description'].forEach((key) => {
      queryParams.delete(key);
      hashParams.delete(key);
    });
    url.hash = hashParams.toString();
    window.history.replaceState({}, document.title, url);
    return { code: errorCode || '', description: description || '' };
  }

  function getIdentityLinkErrorMessage(provider, error) {
    const name = provider === 'google' ? 'Google' : 'Discord';
    const detail = `${error.code || error.error || ''} ${
      error.description || error.message || ''
    }`.toLowerCase();
    if (
      detail.includes('identity_already_exists') ||
      detail.includes('already linked') ||
      detail.includes('already associated')
    ) {
      return `Impossible de relier ce compte ${name} : cette identité est déjà associée à un autre compte du site. Connecte-toi à ce compte pour la délier avant de réessayer.`;
    }
    if (
      detail.includes('manual_linking_disabled') ||
      detail.includes('linking identities is disabled')
    ) {
      return 'La liaison manuelle est désactivée dans Supabase. Active « Allow manual linking » dans Authentication → Sign In / Providers, puis réessaie.';
    }
    return `La liaison du compte ${name} a échoué. ${
      error.description || error.message ||
      'Vérifie la configuration OAuth dans Supabase puis réessaie.'
    }`;
  }

  function renderAccountPanel(panel) {
    panel.replaceChildren();
    if (currentUser) {
      const identity = document.createElement('span');
      identity.textContent = `Connecté·e : ${getNickname(currentUser)}`;
      const manageAccount = document.createElement('a');
      manageAccount.href = `${rootPrefixForCurrentPage()}account.html`;
      manageAccount.className = 'comment-action account-button';
      manageAccount.textContent = 'Compte';
      if (isAdminUser(currentUser)) {
        const adminLink = document.createElement('a');
        adminLink.href = `${rootPrefixForCurrentPage()}admin.html`;
        adminLink.className = 'comment-action account-button';
        adminLink.textContent = 'Administration';
        panel.append(identity, adminLink, manageAccount);
      } else {
        panel.append(identity, manageAccount);
      }
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'comment-action';
      logout.textContent = 'Se déconnecter';
      logout.addEventListener('click', async () => {
        const { error } = await authClient.auth.signOut();
        if (error) {
          console.error('Impossible de se déconnecter.', error);
          window.alert(`Déconnexion impossible : ${error.message}`);
        }
      });
      panel.append(logout);
      return;
    }

    const signIn = document.createElement('button');
    signIn.type = 'button';
    signIn.className = 'comment-action';
    signIn.textContent = 'Créer un compte / se connecter';
    signIn.addEventListener('click', openAccountDialog);
    panel.append(signIn);
  }

  function rootPrefixForCurrentPage() {
    return window.location.pathname.includes('/posts/') ? '../' : './';
  }

  function isAdminUser(user = currentUser) {
    return user?.app_metadata?.role === 'admin';
  }

  async function purgeExpiredModerationArchive() {
    if (!isAdminUser() || archiveMaintenanceUserId === currentUser.id) return;
    await request('rpc/purge_expired_blog_moderation_archive', {
      method: 'POST',
      body: '{}',
    });
    archiveMaintenanceUserId = currentUser.id;
  }

  function getRepliesPageUrl(comment, replyId = null) {
    const url = new URL(`${rootPrefixForCurrentPage()}replies.html`, window.location.href);
    url.searchParams.set('comment', comment.id);
    if (replyId) url.searchParams.set('reply', replyId);
    return url.href;
  }

  function createSiteNavigation() {
    if (document.querySelector('.site-navigation')) return;

    const rootPrefix = rootPrefixForCurrentPage();
    const navigation = document.createElement('nav');
    navigation.className = 'site-navigation';
    navigation.setAttribute('aria-label', 'Navigation principale');
    [
      ['Accueil', 'index.html'],
      ['À propos', 'about.html'],
      ['Contact', 'contact.html'],
      ['Posts', 'posts/index.html'],
      ['Commentaires', 'comments.html'],
    ].forEach(([label, path]) => {
      const link = document.createElement('a');
      link.href = `${rootPrefix}${path}`;
      link.textContent = label;
      navigation.appendChild(link);
    });

    const accountPanel = document.createElement('div');
    accountPanel.className = 'account-panel';
    accountPanels.add(accountPanel);
    renderAccountPanel(accountPanel);
    navigation.appendChild(accountPanel);

    const title = document.querySelector('.site-title');
    if (title) title.insertAdjacentElement('afterend', navigation);
    else document.body.prepend(navigation);
  }

  function openAccountDialog() {
    if (!authClient) {
      window.alert(
        'Le service de comptes n’est pas disponible. Recharge la page ou réessaie plus tard.',
      );
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'report-dialog account-dialog';
    const heading = document.createElement('h2');
    const form = document.createElement('form');
    form.className = 'comment-form';
    const status = createStatus(form);
    function createOAuthButton(provider, label, scopes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `comment-action oauth-sign-in ${provider}-sign-in`;
      button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        status.textContent = `Connexion avec ${provider === 'google' ? 'Google' : 'Discord'}...`;
        try {
          const { error } = await authClient.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: getSiteRedirectUrl(),
              ...(scopes ? { scopes } : {}),
            },
          });
          if (error) throw error;
        } catch (error) {
          console.error(`Connexion ${provider} impossible.`, error);
          status.textContent = `Connexion ${provider} impossible : ${error.message}`;
          button.disabled = false;
        }
      });
      return button;
    }
    const oauthButtons = document.createElement('div');
    oauthButtons.className = 'oauth-buttons';
    oauthButtons.append(
        createOAuthButton('google', 'Continuer avec Google'),
        createOAuthButton('discord', 'Continuer avec Discord', 'identify email'),
    );
    const divider = document.createElement('p');
    divider.className = 'account-dialog-divider';
    divider.textContent = 'Ou avec ton e-mail';
    const nicknameLabel = document.createElement('label');
    nicknameLabel.textContent = 'Ton pseudo :';
    const nicknameInput = document.createElement('input');
    nicknameInput.name = 'nickname';
    nicknameInput.type = 'text';
    nicknameInput.maxLength = 40;
    nicknameInput.autocomplete = 'nickname';
    nicknameLabel.appendChild(nicknameInput);
    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Ton e-mail :';
    const emailInput = document.createElement('input');
    emailInput.name = 'email';
    emailInput.type = 'email';
    emailInput.required = true;
    emailInput.autocomplete = 'email';
    emailLabel.appendChild(emailInput);
    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'Mot de passe (8 caractères minimum) :';
    const passwordInput = document.createElement('input');
    passwordInput.name = 'password';
    passwordInput.type = 'password';
    passwordInput.required = true;
    passwordInput.autocomplete = 'current-password';
    passwordLabel.appendChild(passwordInput);
    const submit = document.createElement('button');
    submit.type = 'submit';
    const switchMode = document.createElement('button');
    switchMode.type = 'button';
    switchMode.className = 'comment-action';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'comment-action';
    cancel.textContent = 'Annuler';
    cancel.addEventListener('click', () => dialog.close());
    let mode = 'signup';

    function setMode(nextMode) {
      mode = nextMode;
      const creatingAccount = mode === 'signup';
      heading.textContent = creatingAccount ? 'Créer un compte' : 'Se connecter';
      nicknameLabel.hidden = !creatingAccount;
      nicknameInput.required = creatingAccount;
      passwordInput.minLength = creatingAccount ? 8 : 1;
      passwordInput.autocomplete = creatingAccount ? 'new-password' : 'current-password';
      submit.textContent = creatingAccount ? 'Créer le compte' : 'Se connecter';
      switchMode.textContent = creatingAccount ? 'J’ai déjà un compte' : 'Créer un compte';
      status.textContent = '';
    }

    switchMode.addEventListener('click', () => {
      setMode(mode === 'signup' ? 'signin' : 'signup');
    });
    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    actions.append(submit, switchMode, cancel);
    form.append(
      oauthButtons,
      divider,
      nicknameLabel,
      emailLabel,
      passwordLabel,
      actions,
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      submit.disabled = true;
      status.textContent = mode === 'signup' ? 'Création du compte...' : 'Connexion...';
      try {
        const result = mode === 'signup'
          ? await authClient.auth.signUp({
            email,
            password,
            options: {
              data: { nickname: nicknameInput.value.trim() },
              emailRedirectTo: getSiteRedirectUrl(),
            },
          })
          : await authClient.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (mode === 'signup' && !result.data.session) {
          setMode('signin');
          status.textContent = 'Compte créé. Confirme ton adresse avec le lien reçu par e-mail, puis connecte-toi.';
          return;
        }
        status.textContent = 'Connecté·e !';
        dialog.close();
      } catch (error) {
        console.error('Authentification impossible.', error);
        status.textContent = `Opération impossible : ${error.message}`;
      } finally {
        submit.disabled = false;
      }
    });

    setMode('signup');
    dialog.append(heading, form);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  async function refreshCurrentUser() {
    const { data, error } = await authClient.auth.getUser();
    if (error) throw error;
    currentUser = data.user;
    const { data: identityData, error: identityError } = await authClient.auth
      .getUserIdentities();
    if (identityError) throw identityError;
    currentIdentities = identityData.identities;
    accountIdentityError = '';
    accountPanels.forEach(renderAccountPanel);
  }

  function renderAccountPage() {
    const container = document.querySelector('[data-account-page]');
    if (!container) return;
    container.replaceChildren();

    const header = document.createElement('header');
    header.className = 'account-page-header';
    const heading = document.createElement('h2');
    heading.textContent = currentUser ? 'Paramètres du compte' : 'Gérer mon compte';
    const introduction = document.createElement('p');
    introduction.textContent = currentUser
      ? 'Gère ton adresse e-mail et les services utilisés pour te connecter.'
      : 'Connecte-toi pour gérer ton compte et tes méthodes de connexion.';
    header.append(heading, introduction);
    container.appendChild(header);

    if (!currentUser) {
      const loginCard = document.createElement('section');
      loginCard.className = 'account-login-card';
      const loginHeading = document.createElement('h3');
      loginHeading.textContent = 'Connexion';
      const message = document.createElement('p');
      message.textContent =
        'Connecte-toi pour associer Google ou Discord et retrouver ton compte plus facilement.';
      const login = document.createElement('button');
      login.type = 'button';
      login.className = 'comment-action';
      login.textContent = 'Créer un compte / se connecter';
      login.addEventListener('click', openAccountDialog);
      loginCard.append(loginHeading, message, login);
      container.appendChild(loginCard);
      if (accountMessage) {
        const status = createStatus(container);
        status.classList.add('account-error');
        status.textContent = accountMessage;
      }
      return;
    }

    if (!currentIdentities) {
      const message = document.createElement('p');
      message.setAttribute('role', 'status');
      message.textContent = accountIdentityError ||
        'Chargement des identités du compte...';
      message.className = 'account-loading';
      container.appendChild(message);
      return;
    }

    const accountSummary = document.createElement('section');
    accountSummary.className = 'account-summary';
    const emailHeading = document.createElement('h3');
    emailHeading.textContent = 'Adresse e-mail';
    const email = document.createElement('p');
    email.className = 'account-email';
    email.textContent = currentUser.email
      ? `Adresse du compte : ${currentUser.email}`
      : 'Aucune adresse e-mail associée à ce compte.';
    accountSummary.append(emailHeading, email);
    container.appendChild(accountSummary);

    const providersHeading = document.createElement('h3');
    providersHeading.className = 'account-section-title';
    providersHeading.textContent = 'Méthodes de connexion';
    const explanation = document.createElement('p');
    explanation.className = 'account-section-description';
    explanation.textContent =
      'Associe Google ou Discord pour te connecter avec ces services. Tu peux retirer une méthode si une autre reste disponible.';
    const providerList = document.createElement('div');
    providerList.className = 'account-provider-list';
    const status = createStatus(container);
    if (accountMessage) {
      status.classList.add('account-error');
      status.textContent = accountMessage;
    }
    const linkedIdentities = currentIdentities;

    ['google', 'discord'].forEach((provider) => {
      const identity = linkedIdentities.find((item) =>
        item.provider === provider
      );
      const section = document.createElement('section');
      section.className = 'account-provider';
      const title = document.createElement('h3');
      title.textContent = provider === 'google' ? 'Google' : 'Discord';
      const providerStatus = document.createElement('p');
      providerStatus.className = identity
        ? 'account-provider-status is-linked'
        : 'account-provider-status';
      providerStatus.textContent = identity
        ? 'Compte associé'
        : 'Aucun compte associé';
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'comment-action';

      if (identity) {
        action.textContent = `Délier ${title.textContent}`;
        const cannotUnlinkLastIdentity = linkedIdentities.length <= 1;
        action.disabled = cannotUnlinkLastIdentity;
        if (cannotUnlinkLastIdentity) {
          providerStatus.textContent =
            'C’est ta seule méthode de connexion. Relie une autre méthode avant de la délier.';
        }
        action.addEventListener('click', async () => {
          action.disabled = true;
          status.textContent = `Déliaison de ${title.textContent}...`;
          let identityUnlinked = false;
          try {
            const { error } = await authClient.auth.unlinkIdentity(identity);
            if (error) throw error;
            identityUnlinked = true;
            await refreshCurrentUser();
            renderAccountPage();
          } catch (error) {
            console.error(`Impossible de délier ${provider}.`, error);
            status.textContent = identityUnlinked
              ? 'Identité déliée, mais son état n’a pas pu être actualisé. Recharge la page.'
              : `Déliaison impossible : ${error.message}`;
            if (!identityUnlinked) action.disabled = false;
          }
        });
      } else {
        action.textContent = 'Relier ce compte';
        action.addEventListener('click', async () => {
          action.disabled = true;
          status.textContent = `Redirection vers ${title.textContent}...`;
          try {
            sessionStorage.setItem(pendingIdentityLinkKey, provider);
            const { error } = await authClient.auth.linkIdentity({
              provider,
              options: {
                redirectTo: getAccountRedirectUrl(),
                ...(provider === 'discord' ? { scopes: 'identify email' } : {}),
              },
            });
            if (error) throw error;
          } catch (error) {
            sessionStorage.removeItem(pendingIdentityLinkKey);
            console.error(`Impossible de relier ${provider}.`, error);
            status.textContent = getIdentityLinkErrorMessage(provider, error);
            status.classList.add('account-error');
            action.disabled = false;
          }
        });
      }
      section.append(title, providerStatus, action);
      providerList.appendChild(section);
    });
    container.append(providersHeading, explanation, providerList);
  }

  async function requireAccount() {
    if (currentUser) return true;
    openAccountDialog();
    return false;
  }

  function createAdminModerationActions(item, table, refresh, archived = false) {
    if (!isAdminUser()) return null;

    const actions = document.createElement('div');
    actions.className = 'comment-actions comment-moderation-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = archived
      ? 'comment-action moderation-restore-action'
      : 'comment-action comment-delete-action';
    button.textContent = archived ? 'Restaurer' : 'Supprimer (récupérable)';
    button.addEventListener('click', async () => {
      const label = table === 'blog_comments' ? 'ce commentaire' : 'cette réponse';
      const confirmation = archived
        ? `Restaurer ${label} et le rendre à nouveau visible ?`
        : table === 'blog_comments'
          ? 'Supprimer ce commentaire ? Il sera masqué et conservé temporairement dans les Archives de modération, avec ses réponses, avant le nettoyage automatique.'
          : 'Supprimer cette réponse ? Elle sera masquée et conservée temporairement dans les Archives de modération avant le nettoyage automatique.';
      if (!window.confirm(confirmation)) return;

      button.disabled = true;
      const deletedAt = archived ? null : new Date().toISOString();
      try {
        const updated = await request(
          `${table}?id=eq.${encodeURIComponent(item.id)}&select=id`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ deleted_at: deletedAt }),
          },
        );
        if (!updated.length) {
          throw new Error('Contenu introuvable ou droits de modération insuffisants.');
        }
      } catch (error) {
        console.error(`Impossible de ${archived ? 'restaurer' : 'archiver'} ${label}.`, error);
        window.alert(`${archived ? 'Restauration' : 'Archivage'} impossible : ${error.message}`);
        button.disabled = false;
        return;
      }

      item.deleted_at = deletedAt;
      try {
        await refresh();
      } catch (error) {
        console.error(
          `${label} ${archived ? 'restauré' : 'archivé'}, mais impossible d’actualiser la liste.`,
          error,
        );
        window.alert(
          `${archived ? 'Restauration' : 'Archivage'} enregistré, mais impossible d’actualiser la liste. Recharge la page.`,
        );
        button.disabled = false;
      }
    });
    actions.appendChild(button);
    if (archived) {
      actions.appendChild(createAdminPermanentDeleteButton(item, table, refresh));
    }
    return actions;
  }

  function createAdminPermanentDeleteButton(item, table, refresh) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'comment-action comment-delete-action';
    button.textContent = 'Supprimer';
    button.addEventListener('click', async () => {
      const confirmed = await confirmPermanentDeletion(item, table);
      if (!confirmed) return;

      button.disabled = true;
      try {
        const deleted = await request(
          `${table}?id=eq.${encodeURIComponent(item.id)}&select=id`,
          {
            method: 'DELETE',
            headers: { Prefer: 'return=representation' },
          },
        );
        if (!deleted.length) {
          throw new Error(
            'Supabase n’a supprimé aucune ligne. Vérifie que les politiques RLS de suppression admin sont appliquées, que le compte possède app_metadata.role = "admin", puis reconnecte-toi pour actualiser la session.',
          );
        }
      } catch (error) {
        console.error('Impossible de supprimer définitivement ce contenu.', error);
        window.alert(`Suppression impossible : ${error.message}`);
        button.disabled = false;
        return;
      }

      try {
        await refresh();
      } catch (error) {
        console.error('Contenu supprimé, mais impossible d’actualiser la liste.', error);
        window.alert('Suppression effectuée. Recharge la page pour actualiser la liste.');
        button.disabled = false;
      }
    });
    return button;
  }

  function confirmPermanentDeletion(item, table) {
    const dialog = document.createElement('dialog');
    dialog.className = 'report-dialog moderation-delete-dialog';
    const heading = document.createElement('h2');
    heading.textContent = 'Confirmer la suppression';
    const explanation = document.createElement('p');
    explanation.textContent = table === 'blog_comments'
      ? 'Ce commentaire et toutes ses réponses seront supprimés définitivement. Ils ne pourront pas être restaurés depuis les Archives de modération.'
      : 'Cette réponse sera supprimée définitivement. Ses éventuelles réponses resteront dans la discussion.';
    const preview = document.createElement('blockquote');
    preview.textContent = `${item.author_name} : ${item.body}`;
    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'comment-action';
    cancel.textContent = 'Annuler';
    cancel.autofocus = true;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'comment-action comment-delete-action';
    confirm.textContent = 'Oui, supprimer définitivement';
    cancel.addEventListener('click', () => dialog.close('cancel'));
    confirm.addEventListener('click', () => dialog.close('confirm'));
    actions.append(cancel, confirm);
    dialog.append(heading, explanation, preview, actions);

    return new Promise((resolve) => {
      dialog.addEventListener('close', () => {
        const confirmed = dialog.returnValue === 'confirm';
        dialog.remove();
        resolve(confirmed);
      }, { once: true });
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  function createCharacterCounter(input, limit = 256) {
    const counter = document.createElement('output');
    counter.className = 'character-counter';
    counter.setAttribute('aria-live', 'polite');
    const update = () => {
      const remaining = limit - input.value.length;
      counter.textContent =
        `${input.value.length} / ${limit} caractères (${remaining} restants)`;
    };
    input.addEventListener('input', update);
    update();
    return counter;
  }

  function createContentOwnerActions(item, table, refresh, label) {
    if (!currentUser || item.user_id !== currentUser.id) return null;

    const actions = document.createElement('div');
    actions.className = 'comment-actions comment-owner-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'comment-action';
    editButton.textContent = 'Modifier';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'comment-action comment-delete-action';
    deleteButton.textContent = 'Supprimer';

    const form = document.createElement('form');
    form.className = 'comment-form comment-edit-form';
    form.hidden = true;
    const fieldLabel = document.createElement('label');
    fieldLabel.textContent = `Modifier ${label} :`;
    const input = document.createElement('textarea');
    input.name = 'body';
    input.maxLength = 256;
    input.rows = 4;
    input.required = true;
    input.value = item.body;
    fieldLabel.append(input, createCharacterCounter(input));

    const formActions = document.createElement('div');
    formActions.className = 'comment-actions';
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.textContent = 'Enregistrer';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'comment-action';
    cancelButton.textContent = 'Annuler';
    const status = createStatus(form);
    cancelButton.addEventListener('click', () => {
      form.hidden = true;
      input.value = item.body;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = '';
    });
    formActions.append(saveButton, cancelButton);
    form.append(fieldLabel, formActions, status);

    editButton.addEventListener('click', () => {
      form.hidden = !form.hidden;
      if (!form.hidden) input.focus();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = input.value.trim();
      if (!body) {
        status.textContent = 'Écris un texte avant de l’enregistrer.';
        return;
      }
      saveButton.disabled = true;
      try {
        const updated = await request(`${table}?id=eq.${encodeURIComponent(item.id)}&select=id`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ body }),
        });
        if (!updated.length) {
          throw new Error('Ce contenu ne t’appartient plus ou il n’existe plus.');
        }
      } catch (error) {
        console.error(`Impossible de modifier ${label}.`, error);
        status.textContent = `Modification impossible : ${error.message}`;
        saveButton.disabled = false;
        return;
      }
      try {
        await refresh();
      } catch (error) {
        console.error(`${label} modifié, mais impossible d’actualiser la liste.`, error);
        status.textContent = `Modification enregistrée. Recharge la page pour actualiser la liste.`;
      } finally {
        saveButton.disabled = false;
      }
    });

    deleteButton.addEventListener('click', async () => {
      const confirmation = table === 'blog_comments'
        ? 'Supprimer ce commentaire et toutes ses réponses ? Cette action est définitive.'
        : 'Supprimer cette réponse ? Les réponses reçues resteront dans la discussion.';
      if (!window.confirm(confirmation)) return;
      deleteButton.disabled = true;
      try {
        const deleted = await request(`${table}?id=eq.${encodeURIComponent(item.id)}&select=id`, {
          method: 'DELETE',
          headers: { Prefer: 'return=representation' },
        });
        if (!deleted.length) {
          throw new Error('Ce contenu ne t’appartient plus ou il n’existe plus.');
        }
      } catch (error) {
        console.error(`Impossible de supprimer ${label}.`, error);
        form.hidden = false;
        status.textContent = `Suppression impossible : ${error.message}`;
        deleteButton.disabled = false;
        return;
      }
      try {
        await refresh();
      } catch (error) {
        console.error(`${label} supprimé, mais impossible d’actualiser la liste.`, error);
        form.hidden = false;
        status.textContent = 'Suppression enregistrée. Recharge la page pour actualiser la liste.';
      } finally {
        deleteButton.disabled = false;
      }
    });

    actions.append(editButton, deleteButton, form);
    return actions;
  }

  function createCommentForm(postId, onSubmitted, includePostSelect) {
    const form = document.createElement('form');
    form.className = 'comment-form';

    if (includePostSelect) {
      const postLabel = document.createElement('label');
      postLabel.textContent = 'Article :';
      postLabel.htmlFor = 'comment-post-select';
      const postSelect = document.createElement('select');
      postSelect.name = 'post_id';
      postSelect.id = 'comment-post-select';
      postSelect.required = true;
      Object.entries(postTitles).forEach(([id, title]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = title;
        postSelect.appendChild(option);
      });
      form.append(postLabel, postSelect);
    }

    const bodyLabel = document.createElement('label');
    bodyLabel.textContent = 'Ton commentaire :';
    const bodyInput = document.createElement('textarea');
    bodyInput.name = 'body';
    bodyInput.maxLength = 256;
    bodyInput.rows = 4;
    bodyInput.required = true;
    bodyLabel.append(bodyInput, createCharacterCounter(bodyInput));

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Publier le commentaire';
    form.append(bodyLabel, submit);

    const status = createStatus(form);
    form.addEventListener('reset', () => {
      window.setTimeout(() => {
        bodyInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!await requireAccount()) {
        status.textContent = 'Connecte-toi ou crée un compte pour commenter.';
        return;
      }
      const formData = new FormData(form);
      const commentPostId = includePostSelect ? formData.get('post_id') : postId;
      const authorName = getNickname(currentUser);
      const body = String(formData.get('body') || '').trim();
      if (!authorName || !body) {
        status.textContent = 'Ajoute un pseudo et un commentaire avant de publier.';
        return;
      }

      submit.disabled = true;
      status.textContent = 'Publication en cours...';
      try {
        await request('blog_comments', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            post_id: commentPostId,
            author_name: authorName,
            body,
            user_id: currentUser.id,
          }),
        });
      } catch (error) {
        console.error('Impossible de publier le commentaire.', error);
        status.textContent = 'Publication impossible. Vérifie la configuration Supabase et réessaie.';
        submit.disabled = false;
        return;
      }

      form.reset();
      status.textContent = 'Commentaire publié !';
      try {
        await onSubmitted();
      } catch (error) {
        console.error(
          'Le commentaire a été publié, mais la liste n’a pas pu être actualisée.',
          error,
        );
        status.textContent = 'Commentaire publié ! Recharge la page pour actualiser la liste.';
      } finally {
        submit.disabled = false;
      }
    });
    return form;
  }

  function formatDate(value) {
    return new Date(value).toLocaleString('fr-FR');
  }

  function createReplyForm(
    comment,
    onSubmitted,
    initiallyVisible = false,
    parentReply = null,
  ) {
    const form = document.createElement('form');
    form.className = 'comment-form reply-form';
    form.hidden = !initiallyVisible;

    const label = document.createElement('label');
    label.textContent = parentReply
      ? `Ta réponse à ${parentReply.author_name} :`
      : 'Ta réponse :';
    const input = document.createElement('textarea');
    input.name = 'body';
    input.maxLength = 256;
    input.rows = 3;
    input.required = true;
    label.append(input, createCharacterCounter(input));

    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Publier la réponse';
    const status = createStatus(form);
    actions.appendChild(submit);
    form.append(label, actions, status);

    form.addEventListener('reset', () => {
      window.setTimeout(() => input.dispatchEvent(new Event('input', { bubbles: true })));
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!await requireAccount()) return;
      const body = input.value.trim();
      if (!body) {
        status.textContent = 'Écris une réponse avant de la publier.';
        return;
      }

      submit.disabled = true;
      status.textContent = 'Publication de la réponse...';
      try {
        await request('blog_comment_replies', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            comment_id: comment.id,
            parent_reply_id: parentReply?.id || null,
            author_name: getNickname(currentUser),
            body,
            user_id: currentUser.id,
          }),
        });
      } catch (error) {
        console.error('Impossible de publier la réponse.', error);
        status.textContent = `Publication impossible : ${error.message}`;
        submit.disabled = false;
        return;
      }

      form.reset();
      status.textContent = 'Réponse publiée !';
      try {
        await onSubmitted();
      } catch (error) {
        console.error(
          'La réponse a été publiée, mais la liste n’a pas pu être actualisée.',
          error,
        );
        status.textContent =
          'Réponse publiée. Recharge la page pour actualiser la liste.';
      }
      submit.disabled = false;
    });
    return form;
  }

  function createCommentCard(
    comment,
    refresh,
    replyData = { count: 0, previews: [] },
    archived = false,
  ) {
    const card = document.createElement('article');
    card.className = 'visitor-comment';
    if (archived) card.classList.add('is-moderation-archived');

    const heading = document.createElement('h3');
    heading.textContent = `${comment.author_name} | ${formatDate(comment.created_at)}`;
    card.appendChild(heading);

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = comment.body;
    card.appendChild(body);
    if (archived) {
      const archivedLabel = document.createElement('p');
      archivedLabel.className = 'moderation-archive-label';
      archivedLabel.textContent = 'Dans les archives de modération';
      const moderationActions = createAdminModerationActions(
        comment,
        'blog_comments',
        refresh,
        true,
      );
      const threadLink = document.createElement('a');
      threadLink.className = 'comment-action reply-toggle';
      threadLink.href = getRepliesPageUrl(comment);
      threadLink.textContent = 'Ouvrir la discussion';
      card.append(archivedLabel, moderationActions, threadLink);
      return card;
    }
    const ownerActions = createContentOwnerActions(
      comment,
      'blog_comments',
      refresh,
      'ton commentaire',
    );
    if (ownerActions) card.appendChild(ownerActions);
    const moderationActions = createAdminModerationActions(
      comment,
      'blog_comments',
      refresh,
    );
    if (moderationActions) card.appendChild(moderationActions);

    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    appendVoteControls(
      actions,
      { commentId: comment.id },
      comment.blog_comment_votes || [],
      refresh,
      'ce commentaire',
    );

    const replyButton = document.createElement('button');
    replyButton.type = 'button';
    replyButton.className = 'comment-action reply-toggle';
    replyButton.textContent = 'Répondre';
    const replyForm = createReplyForm(comment, refresh, false);
    replyButton.addEventListener('click', async () => {
      if (!await requireAccount()) return;
      replyForm.hidden = !replyForm.hidden;
      if (!replyForm.hidden) replyForm.querySelector('textarea').focus();
    });

    actions.append(replyButton, createReportButton(comment));
    if (isAdminUser()) {
      const moderateRepliesLink = document.createElement('a');
      moderateRepliesLink.className = 'comment-action reply-toggle';
      moderateRepliesLink.href = getRepliesPageUrl(comment);
      moderateRepliesLink.textContent = 'Modérer les réponses';
      actions.appendChild(moderateRepliesLink);
    }
    card.append(actions);

    if (replyData.count > 0) {
      const replies = document.createElement('div');
      replies.className = 'comment-replies-preview';
      const heading = document.createElement('h4');
      heading.textContent = replyData.count === 1
        ? '1 réponse'
        : `${replyData.count} réponses`;
      replies.appendChild(heading);
      replyData.previews.forEach((reply) => {
        const preview = document.createElement('article');
        preview.className = 'comment-reply-preview';
        const replyHeading = document.createElement('h5');
        replyHeading.textContent =
          `${reply.author_name} | ${formatDate(reply.created_at)}`;
        const replyBody = document.createElement('p');
        replyBody.className = 'comment-body';
        replyBody.textContent = reply.body;
        const replyLink = document.createElement('a');
        replyLink.className = 'comment-action reply-toggle';
        replyLink.href = getRepliesPageUrl(comment, reply.id);
        replyLink.textContent = 'Répondre';
        preview.append(replyHeading, replyBody, replyLink);
        if (isAdminUser()) {
          const replyModerationActions = createAdminModerationActions(
            reply,
            'blog_comment_replies',
            refresh,
          );
          if (replyModerationActions) preview.appendChild(replyModerationActions);
        }
        replies.appendChild(preview);
      });
      if (replyData.count > 0) {
        const viewAll = document.createElement('a');
        viewAll.className = 'view-all-replies';
        viewAll.href = getRepliesPageUrl(comment);
        viewAll.textContent = replyData.count > replyPreviewLimit
          ? `Voir les ${replyData.count} réponses`
          : 'Ouvrir la discussion';
        replies.appendChild(viewAll);
      }
      card.appendChild(replies);
    }
    card.appendChild(replyForm);
    return card;
  }

  function appendVoteControls(actions, target, votes, refresh, label) {
    const upCount = votes.filter((item) => item.vote === 1).length;
    const downCount = votes.filter((item) => item.vote === -1).length;
    const storedVote = myVotes.get(target.replyId || target.commentId);
    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.className = `comment-action${storedVote === 1 ? ' selected' : ''}`;
    upButton.textContent = `⬆️ ${upCount}`;
    upButton.setAttribute('aria-label', `Aimer ${label}, ${upCount} likes`);

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.className = `comment-action${storedVote === -1 ? ' selected' : ''}`;
    downButton.textContent = `⬇️ ${downCount}`;
    downButton.setAttribute(
      'aria-label',
      `Ne pas aimer ${label}, ${downCount} dislikes`,
    );
    upButton.addEventListener('click', async () => {
      if (await requireAccount()) {
        vote(target, 1, refresh, [upButton, downButton]);
      }
    });
    downButton.addEventListener('click', async () => {
      if (await requireAccount()) {
        vote(target, -1, refresh, [upButton, downButton]);
      }
    });
    actions.append(upButton, downButton);
  }

  function createReportButton(comment, reply = null) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'comment-action report-action';
    button.textContent = 'Signaler';
    button.addEventListener('click', async () => {
      if (await requireAccount()) report(comment, reply);
    });
    return button;
  }

  async function vote(target, value, refresh, buttons) {
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      const targetField = 'reply_id';
      const targetFilter = target.replyId
        ? `eq.${target.replyId}`
        : 'is.null';
      const voteQuery = new URLSearchParams({
        select: 'vote',
        comment_id: `eq.${target.commentId}`,
        [targetField]: targetFilter,
        user_id: `eq.${currentUser.id}`,
      });
      const existingVotes = await request(`blog_comment_votes?${voteQuery}`);
      const existingVote = existingVotes[0]?.vote;

      if (existingVote === value) {
        const deleteQuery = new URLSearchParams({
          comment_id: `eq.${target.commentId}`,
          [targetField]: targetFilter,
          user_id: `eq.${currentUser.id}`,
        });
        await request(`blog_comment_votes?${deleteQuery}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
      } else if (existingVotes.length > 0) {
        const updateQuery = new URLSearchParams({
          comment_id: `eq.${target.commentId}`,
          [targetField]: targetFilter,
          user_id: `eq.${currentUser.id}`,
        });
        await request(`blog_comment_votes?${updateQuery}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ vote: value }),
        });
      } else {
        await request('blog_comment_votes', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            comment_id: target.commentId,
            ...(target.replyId ? { reply_id: target.replyId } : {}),
            visitor_id: getVoterId(),
            vote: value,
            user_id: currentUser.id,
          }),
        });
      }
    } catch (error) {
      console.error('Impossible d’enregistrer le vote.', error);
      window.alert(`Vote impossible : ${error.message}`);
      return;
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }

    try {
      await refresh();
    } catch (error) {
      console.error(
        'Le vote a changé, mais la liste n’a pas pu être actualisée.',
        error,
      );
      window.alert(
        'Vote mis à jour. Recharge la page pour actualiser le total.',
      );
    }
  }

  async function report(comment, reply = null) {
    const dialog = document.createElement('dialog');
    dialog.className = 'report-dialog';
    const form = document.createElement('form');
    form.className = 'comment-form';

    const heading = document.createElement('h2');
    heading.textContent = reply ? 'Signaler cette réponse' : 'Signaler ce commentaire';
    const details = document.createElement('p');
    details.append('Article : ');
    const postLink = document.createElement('a');
    postLink.href = getPostUrl(comment.post_id);
    postLink.textContent = postTitles[comment.post_id] || comment.post_id;
    details.appendChild(postLink);
    if (reply) {
      details.append(
        document.createElement('br'),
        document.createTextNode(`Réponse de ${reply.author_name} : ${reply.body}`),
      );
    }
    const messageLabel = document.createElement('label');
    messageLabel.textContent = 'Pourquoi signales-tu ce commentaire ?';
    const messageInput = document.createElement('textarea');
    messageInput.name = 'message';
    messageInput.required = true;
    messageInput.maxLength = 2000;
    messageInput.rows = 5;
    messageLabel.appendChild(messageInput);
    const status = createStatus(form);

    const consent = document.createElement('label');
    consent.className = 'report-consent';
    const consentCheckbox = document.createElement('input');
    consentCheckbox.type = 'checkbox';
    consentCheckbox.name = 'consent';
    consentCheckbox.required = true;
    const accountEmail = currentUser.email;
    consent.append(
      consentCheckbox,
      document.createTextNode(
        accountEmail
          ? `J’accepte que mon pseudo et l’adresse ${accountEmail} soient utilisés pour traiter ce signalement et m’envoyer une copie par e-mail.`
          : 'Une adresse e-mail vérifiée est nécessaire pour signaler un commentaire et recevoir une copie.',
      ),
    );
    const buttons = document.createElement('div');
    buttons.className = 'comment-actions';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Envoyer le signalement';
    submit.disabled = !accountEmail;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'comment-action';
    cancel.textContent = 'Annuler';
    cancel.addEventListener('click', () => dialog.close());
    buttons.append(submit, cancel);
    form.append(messageLabel, consent, buttons);
    if (!accountEmail) {
      status.textContent = 'Aucune adresse e-mail vérifiée n’est associée à ce compte. Connecte-toi avec Google ou une adresse e-mail pour signaler.';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!supabaseUrl || !anonKey) {
        status.textContent = 'Connexion Supabase non configurée.';
        return;
      }

      submit.disabled = true;
      status.textContent = 'Envoi du signalement...';
      try {
        const { data: sessionData, error: sessionError } = await authClient.auth
          .getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          throw new Error('Ta session a expiré. Reconnecte-toi puis réessaie.');
        }
        const formData = new FormData(form);
        const response = await fetch(
          `${supabaseUrl}/functions/v1/report-comment`,
          {
          method: 'POST',
          headers: {
            apikey: anonKey,
              Authorization: `Bearer ${sessionData.session.access_token}`,
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment_id: comment.id,
            ...(reply ? { reply_id: reply.id } : {}),
            message: String(formData.get('message') || '').trim(),
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || `Supabase (${response.status})`);
        }
        status.textContent = 'Signalement envoyé ! Une copie a été envoyée à ton adresse de compte.';
        submit.disabled = true;
        setTimeout(() => dialog.close(), 1800);
      } catch (error) {
        console.error('Impossible de signaler le commentaire.', error);
        status.textContent = `Signalement impossible : ${error.message}`;
        submit.disabled = false;
      }
    });

    dialog.append(heading, details, form);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  async function loadComments(postId) {
    const filters = postId ? `&post_id=eq.${encodeURIComponent(postId)}` : '';
    const visibilityFilter = isAdminUser() ? '' : '&deleted_at=is.null';
    return request(
      `blog_comments?select=id,post_id,author_name,body,created_at,deleted_at${currentUser ? ',user_id' : ''}&order=created_at.desc${visibilityFilter}${filters}`,
    );
  }

  async function loadCommentVotes(comments) {
    for (let index = 0; index < comments.length; index += 500) {
      const batch = comments.slice(index, index + 500);
      const query = new URLSearchParams({
        select: 'comment_id,vote',
        comment_id: `in.(${batch.map((comment) => comment.id).join(',')})`,
        reply_id: 'is.null',
      });
      const votes = await request(`blog_comment_votes?${query}`);
      const votesByComment = new Map(batch.map((comment) => [comment.id, []]));
      votes.forEach((item) => votesByComment.get(item.comment_id)?.push(item));
      batch.forEach((comment) => {
        comment.blog_comment_votes = votesByComment.get(comment.id) || [];
      });
    }
  }

  async function loadMyVotes(comments) {
    myVotes = new Map();
    if (!currentUser || !comments.length) return;
    const commentIds = comments.map((comment) => comment.id);
    const query = new URLSearchParams({
      select: 'comment_id,vote',
      user_id: `eq.${currentUser.id}`,
      comment_id: `in.(${commentIds.join(',')})`,
      reply_id: 'is.null',
    });
    const votes = await request(`blog_comment_votes?${query}`);
    myVotes = new Map(votes.map((item) => [item.comment_id, item.vote]));
  }

  function renderList(container, comments, refresh, grouped, replyDataByComment) {
    container.replaceChildren();
    if (!comments.length) {
      const empty = document.createElement('p');
      empty.textContent = container.dataset.moderationArchive === 'true'
        ? 'Les archives de modération sont vides.'
        : 'Pas encore de commentaire... Sois le premier !';
      container.appendChild(empty);
      return;
    }

    let previousPostId = '';
    comments.forEach((comment) => {
      if (grouped && comment.post_id !== previousPostId) {
        const postTitle = document.createElement('h2');
        const postLink = document.createElement('a');
        postLink.href = getPostUrl(comment.post_id);
        postLink.textContent = postTitles[comment.post_id] || comment.post_id;
        postTitle.appendChild(postLink);
        container.appendChild(postTitle);
        previousPostId = comment.post_id;
      }
      container.appendChild(
        createCommentCard(
          comment,
          refresh,
          replyDataByComment.get(comment.id) || { count: 0, previews: [] },
          container.dataset.moderationArchive === 'true',
        ),
      );
    });
  }

  async function loadReplyPreviews(comments) {
    if (!comments.length) return new Map();
    const rows = [];
    for (let index = 0; index < comments.length; index += 500) {
      const batch = comments.slice(index, index + 500);
      rows.push(...await request('rpc/get_blog_comment_reply_previews', {
        method: 'POST',
        body: JSON.stringify({
          p_comment_ids: batch.map((comment) => comment.id),
        }),
      }));
    }
    return new Map(rows.map((row) => [
      row.comment_id,
      { count: Number(row.reply_count), previews: row.previews || [] },
    ]));
  }

  async function loadThreadVotes(commentId, replies) {
    const targetIds = [commentId, ...replies.map((reply) => reply.id)];
    targetIds.forEach((id) => myVotes.delete(id));
    const query = new URLSearchParams({
      select: `comment_id,reply_id,vote${currentUser ? ',user_id' : ''}`,
      comment_id: `eq.${commentId}`,
    });
    const rows = await request(`blog_comment_votes?${query}`);
    const votesByTarget = new Map(targetIds.map((id) => [id, []]));
    rows.forEach((row) => {
      const targetId = row.reply_id || row.comment_id;
      if (!votesByTarget.has(targetId)) return;
      votesByTarget.get(targetId).push({ vote: row.vote });
      if (currentUser && row.user_id === currentUser.id) {
        myVotes.set(targetId, row.vote);
      }
    });
    return votesByTarget;
  }

  async function renderRepliesPage(container) {
    container.replaceChildren();
    const params = new URLSearchParams(window.location.search);
    const commentId = params.get('comment');
    const focusedReplyId = params.get('reply');
    const status = createStatus(container);
    if (!commentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commentId)) {
      status.textContent = 'Le lien vers ce commentaire est invalide.';
      return;
    }

    try {
      const comments = await request(
        `blog_comments?select=id,post_id,author_name,body,created_at,deleted_at${currentUser ? ',user_id' : ''}&id=eq.${commentId}&limit=1`,
      );
      const comment = comments[0];
      if (!comment) {
        status.textContent = 'Ce commentaire n’existe plus.';
        return;
      }

      const article = document.createElement('article');
      article.className = 'visitor-comment replies-parent-comment';
      const commentHeading = document.createElement('h2');
      commentHeading.textContent =
        `Commentaire de ${comment.author_name} | ${formatDate(comment.created_at)}`;
      const commentBody = document.createElement('p');
      commentBody.className = 'comment-body';
      commentBody.textContent = comment.body;
      const parentActions = document.createElement('div');
      parentActions.className = 'comment-actions';
      article.append(commentHeading, commentBody, parentActions);
      const parentModerationActions = createAdminModerationActions(
        comment,
        'blog_comments',
        () => renderRepliesPage(container),
        Boolean(comment.deleted_at),
      );
      if (parentModerationActions) article.appendChild(parentModerationActions);

      const repliesHeading = document.createElement('h2');
      repliesHeading.className = 'all-replies-heading';
      repliesHeading.textContent = 'Toutes les réponses';
      const repliesList = document.createElement('div');
      repliesList.className = 'all-replies-list';
      let focusedReplyForm = null;
      const refresh = async () => {
        const query = new URLSearchParams({
          select: `id,parent_reply_id,author_name,body,created_at,deleted_at${currentUser ? ',user_id' : ''}`,
          comment_id: `eq.${comment.id}`,
          ...(!isAdminUser() ? { deleted_at: 'is.null' } : {}),
          order: 'created_at.asc,id.asc',
        });
        const replies = await request(`blog_comment_replies?${query}`);
        const votesByTarget = await loadThreadVotes(comment.id, replies);
        comment.blog_comment_votes = votesByTarget.get(comment.id) || [];
        parentActions.replaceChildren();
        if (!comment.deleted_at) {
          appendVoteControls(
            parentActions,
            { commentId: comment.id },
            comment.blog_comment_votes,
            refresh,
            'ce commentaire',
          );
          parentActions.appendChild(createReportButton(comment));
        }
        repliesList.replaceChildren();
        if (!replies.length) {
          const empty = document.createElement('p');
          empty.textContent = 'Pas encore de réponse. Sois le premier !';
          repliesList.appendChild(empty);
          return;
        }

        const repliesById = new Map(replies.map((reply) => [
          reply.id,
          { ...reply, children: [] },
        ]));
        const rootReplies = [];
        repliesById.forEach((reply) => {
          const parent = reply.parent_reply_id
            ? repliesById.get(reply.parent_reply_id)
            : null;
          if (parent) parent.children.push(reply);
          else rootReplies.push(reply);
        });

        const pendingReplies = rootReplies
          .slice()
          .reverse()
          .map((reply) => ({ reply, depth: 0 }));
        const renderedReplies = [];
        while (pendingReplies.length) {
          const { reply, depth } = pendingReplies.pop();
          renderedReplies.push({ reply, depth });
          for (let index = reply.children.length - 1; index >= 0; index -= 1) {
            pendingReplies.push({
              reply: reply.children[index],
              depth: depth + 1,
            });
          }
        }

        renderedReplies.forEach(({ reply, depth }) => {
          const replyCard = document.createElement('article');
          replyCard.className = 'visitor-comment comment-reply';
          replyCard.style.setProperty('--reply-depth', Math.min(depth, 4));
          const replyArchived = Boolean(reply.deleted_at || comment.deleted_at);
          if (replyArchived) replyCard.classList.add('is-moderation-archived');
          const heading = document.createElement('h3');
          heading.textContent =
            `${reply.author_name} | ${formatDate(reply.created_at)}`;
          const body = document.createElement('p');
          body.className = 'comment-body';
          body.textContent = reply.body;
          const ownerActions = createContentOwnerActions(
            reply,
            'blog_comment_replies',
            refresh,
            'ta réponse',
          );
          const moderationActions = comment.deleted_at
            ? createAdminPermanentDeleteButton(
              reply,
              'blog_comment_replies',
              refresh,
            )
            : createAdminModerationActions(
              reply,
              'blog_comment_replies',
              refresh,
              Boolean(reply.deleted_at),
            );
          const actions = document.createElement('div');
          actions.className = 'comment-actions';
          const replyButton = document.createElement('button');
          replyButton.type = 'button';
          replyButton.className = 'comment-action reply-toggle';
          replyButton.textContent = 'Répondre';
          const replyForm = createReplyForm(comment, refresh, reply.id === focusedReplyId, reply);
          if (replyArchived) {
            const archivedLabel = document.createElement('p');
            archivedLabel.className = 'moderation-archive-label';
            archivedLabel.textContent = 'Dans les archives de modération';
            replyCard.appendChild(archivedLabel);
          }
          if (reply.id === focusedReplyId) focusedReplyForm = replyForm;
          replyButton.addEventListener('click', async () => {
            if (!await requireAccount()) return;
            replyForm.hidden = !replyForm.hidden;
            if (!replyForm.hidden) replyForm.querySelector('textarea').focus();
          });
          if (!replyArchived) {
            appendVoteControls(
              actions,
              { commentId: comment.id, replyId: reply.id },
              votesByTarget.get(reply.id) || [],
              refresh,
              'cette réponse',
            );
            actions.append(replyButton, createReportButton(comment, reply));
          }
          replyCard.append(heading, body);
          if (ownerActions) replyCard.appendChild(ownerActions);
          if (moderationActions) replyCard.appendChild(moderationActions);
          replyCard.append(actions, replyForm);
          repliesList.appendChild(replyCard);
        });
      };

      const replyForm = comment.deleted_at
        ? null
        : createReplyForm(comment, refresh, true);
      const postLink = document.createElement('a');
      postLink.className = 'comment-parent-link';
      postLink.href = getPostUrl(comment.post_id);
      postLink.textContent = 'Retour à l’article';
      container.append(
        article,
        repliesHeading,
        repliesList,
        ...(replyForm ? [replyForm] : []),
        postLink,
      );
      await refresh();
      if (focusedReplyForm) {
        focusedReplyForm.scrollIntoView({ block: 'center' });
        focusedReplyForm.querySelector('textarea').focus();
      }
      status.textContent = '';
    } catch (error) {
      console.error('Impossible de charger les réponses.', error);
      status.textContent =
        `Impossible de charger les réponses : ${error.message}`;
    }
  }

  async function loadAdminRecords(table) {
    const records = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const query = new URLSearchParams({
        select: table === 'blog_comments'
          ? 'id,post_id,author_name,body,created_at,deleted_at'
          : 'id,comment_id,parent_reply_id,author_name,body,created_at,deleted_at',
        order: 'created_at.desc,id.desc',
        limit: String(pageSize),
        offset: String(offset),
      });
      const batch = await request(`${table}?${query}`);
      records.push(...batch);
      if (batch.length < pageSize) return records;
    }
  }

  function createAdminContentCard(item, table, postId = null, archived = false, refresh) {
    const card = document.createElement('article');
    card.className = 'visitor-comment admin-content-card';
    const heading = document.createElement('h3');
    const location = postId ? postTitles[postId] || postId : '';
    heading.textContent = `${item.author_name} | ${formatDate(item.created_at)}${
      location ? ` | ${location}` : ''
    }`;
    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = item.body;
    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const moderationActions = createAdminModerationActions(
      item,
      table,
      refresh,
      archived,
    );
    if (moderationActions) actions.append(...moderationActions.childNodes);
    card.append(heading, body, actions);
    return card;
  }

  let refreshAdminPage = async () => {};

  async function renderAdminPage(container) {
    container.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = 'Modération du site';
    const introduction = document.createElement('p');
    introduction.textContent =
      'Les suppressions sont conservées dans les Archives de modération pendant la durée choisie, puis nettoyées à la prochaine visite admin après expiration.';
    container.append(heading, introduction);

    if (!currentUser) {
      const message = document.createElement('p');
      message.textContent = 'Connecte-toi avec le compte administrateur pour accéder à la modération.';
      const login = document.createElement('button');
      login.type = 'button';
      login.className = 'comment-action';
      login.textContent = 'Créer un compte / se connecter';
      login.addEventListener('click', openAccountDialog);
      container.append(message, login);
      return;
    }
    if (!isAdminUser()) {
      const message = document.createElement('p');
      message.className = 'account-error';
      message.textContent = 'Accès réservé aux comptes administrateurs.';
      container.appendChild(message);
      return;
    }

    const status = createStatus(container);
    status.textContent = 'Chargement des commentaires et des réponses...';
    try {
      await purgeExpiredModerationArchive();
      const settings = await request(
        'blog_moderation_settings?select=retention_days&id=eq.true&limit=1',
      );
      let retentionDays = settings[0]?.retention_days;
      if (!Number.isInteger(retentionDays) || retentionDays < 1) {
        throw new Error('Le réglage de conservation de l’archive est invalide.');
      }

      const [comments, replies] = await Promise.all([
        loadAdminRecords('blog_comments'),
        loadAdminRecords('blog_comment_replies'),
      ]);
      const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
      const archivedComments = comments.filter((comment) => comment.deleted_at);
      const activeComments = comments.filter((comment) => !comment.deleted_at);
      const activeReplies = replies.filter((reply) =>
        !reply.deleted_at && !commentsById.get(reply.comment_id)?.deleted_at,
      );
      const archivedReplies = replies.filter((reply) => reply.deleted_at);
      const archiveView = document.createElement('section');
      const viewControls = document.createElement('div');
      viewControls.className = 'comment-actions moderation-view-controls';
      const activeButton = document.createElement('button');
      activeButton.type = 'button';
      activeButton.className = 'comment-action';
      activeButton.textContent = `Contenus visibles (${activeComments.length + activeReplies.length})`;
      const archiveButton = document.createElement('button');
      archiveButton.type = 'button';
      archiveButton.className = 'comment-action';
      archiveButton.textContent =
        `Archives de modération (${archivedComments.length + archivedReplies.length}, ${retentionDays} j)`;
      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'moderation-search';
      search.placeholder = 'Rechercher un pseudo ou un message';
      search.setAttribute('aria-label', 'Rechercher dans les contenus à modérer');
      const settingsForm = document.createElement('form');
      settingsForm.className = 'moderation-retention-settings';
      const retentionLabel = document.createElement('label');
      retentionLabel.textContent =
        'Conserver les suppressions dans les archives pendant (jours) : ';
      const retentionInput = document.createElement('input');
      retentionInput.type = 'number';
      retentionInput.name = 'retention_days';
      retentionInput.min = '1';
      retentionInput.max = '3650';
      retentionInput.step = '1';
      retentionInput.required = true;
      retentionInput.value = String(retentionDays);
      retentionLabel.appendChild(retentionInput);
      const saveRetention = document.createElement('button');
      saveRetention.type = 'submit';
      saveRetention.className = 'comment-action';
      saveRetention.textContent = 'Enregistrer la durée';
      settingsForm.append(retentionLabel, saveRetention);
      settingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nextRetention = Number(retentionInput.value);
        if (!Number.isInteger(nextRetention) || nextRetention < 1 || nextRetention > 3650) {
          status.textContent = 'Choisis une durée entière entre 1 et 3650 jours.';
          return;
        }
        saveRetention.disabled = true;
        try {
          const updated = await request(
            'blog_moderation_settings?id=eq.true&select=retention_days',
            {
              method: 'PATCH',
              headers: { Prefer: 'return=representation' },
              body: JSON.stringify({
                retention_days: nextRetention,
                updated_at: new Date().toISOString(),
              }),
            },
          );
          if (!updated.length) {
            throw new Error('Le réglage n’a pas été enregistré. Vérifie les droits admin dans Supabase.');
          }
          retentionDays = nextRetention;
          archiveButton.textContent =
            `Archives de modération (${archivedComments.length + archivedReplies.length}, ${retentionDays} j)`;
          status.textContent =
            `Durée enregistrée : ${nextRetention} jours. Les éléments expirés seront nettoyés lors de la prochaine visite admin.`;
        } catch (error) {
          console.error('Impossible d’enregistrer la durée des archives.', error);
          status.textContent = `Enregistrement impossible : ${error.message}`;
        } finally {
          saveRetention.disabled = false;
        }
      });
      const records = document.createElement('div');
      records.className = 'moderation-records';
      let showArchive = false;

      const renderRecords = () => {
        records.replaceChildren();
        const selectedComments = showArchive ? archivedComments : activeComments;
        const selectedReplies = showArchive ? archivedReplies : activeReplies;
        const needle = search.value.trim().toLocaleLowerCase('fr');
        status.textContent = showArchive
          ? `${archivedComments.length} commentaire(s) et ${archivedReplies.length} réponse(s) dans les archives.`
          : `${activeComments.length} commentaire(s) et ${activeReplies.length} réponse(s) visibles.`;
        const addRecord = (item, table, postId, archived, parentComment) => {
          if (needle && !`${item.author_name} ${item.body}`.toLocaleLowerCase('fr').includes(needle)) return;
          const card = createAdminContentCard(
            item,
            table,
            postId,
            archived,
            () => renderAdminPage(container),
          );
          if (table === 'blog_comment_replies') {
            card.classList.add('comment-reply');
            const parentSummary = document.createElement('p');
            parentSummary.className = 'meta';
            parentSummary.textContent = parentComment
              ? `Réponse au commentaire de ${parentComment.author_name} : ${parentComment.body}`
              : 'Le commentaire d’origine n’existe plus.';
            card.insertBefore(parentSummary, card.querySelector('.comment-actions'));
          }
          records.appendChild(card);
        };
        selectedComments.forEach((comment) =>
          addRecord(comment, 'blog_comments', comment.post_id, showArchive),
        );
        selectedReplies.forEach((reply) => {
          const parentComment = commentsById.get(reply.comment_id);
          addRecord(
            reply,
            'blog_comment_replies',
            parentComment?.post_id,
            Boolean(reply.deleted_at),
            parentComment,
          );
        });
        if (!records.childElementCount) {
          const empty = document.createElement('p');
          empty.textContent = needle
            ? 'Aucun résultat pour cette recherche.'
            : showArchive
              ? 'Les archives de modération sont vides.'
              : 'Aucun contenu visible à modérer.';
          records.appendChild(empty);
        }
      };
      activeButton.addEventListener('click', () => {
        showArchive = false;
        renderRecords();
      });
      archiveButton.addEventListener('click', () => {
        showArchive = true;
        renderRecords();
      });
      search.addEventListener('input', renderRecords);
      viewControls.append(activeButton, archiveButton);
      archiveView.append(settingsForm, viewControls, search, records);
      container.appendChild(archiveView);
      renderRecords();
    } catch (error) {
      console.error('Impossible de charger les contenus à modérer.', error);
      status.textContent = `Chargement de la modération impossible : ${error.message}`;
    }
  }

  function initializeAdminPage(container) {
    refreshAdminPage = () => renderAdminPage(container);
    refreshCallbacks.add(refreshAdminPage);
    refreshAdminPage();
  }

  async function initialize(container, postId, includePostSelect) {
    const heading = document.createElement('h2');
    heading.textContent = includePostSelect ? 'Tous les commentaires' : 'Commentaires des visiteurs';
    container.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'comments-list';
    container.appendChild(list);
    const archiveSection = document.createElement('section');
    archiveSection.className = 'moderation-archive-section';
    archiveSection.hidden = true;
    const archiveHeading = document.createElement('h2');
    archiveHeading.textContent = 'Archives de modération';
    const archiveList = document.createElement('div');
    archiveList.className = 'comments-list';
    archiveList.dataset.moderationArchive = 'true';
    archiveSection.append(archiveHeading, archiveList);
    container.appendChild(archiveSection);
    const status = createStatus(container);

    async function refresh() {
      if (!supabaseUrl || !anonKey || supabaseUrl.includes('VOTRE-PROJET')) {
        throw new Error(
          'Renseigne comments-config.js avec les informations publiques de ton projet Supabase.',
        );
      }
      await purgeExpiredModerationArchive();
      const comments = await loadComments(postId);
      const visibleComments = comments.filter((comment) => !comment.deleted_at);
      const archivedComments = isAdminUser()
        ? comments.filter((comment) => comment.deleted_at)
        : [];
      archiveSection.hidden = !isAdminUser();
      let voteTotalsUnavailable = false;
      try {
        await loadCommentVotes(visibleComments);
      } catch (error) {
        console.error('Impossible de charger les totaux des votes.', error);
        visibleComments.forEach((comment) => {
          comment.blog_comment_votes = [];
        });
        voteTotalsUnavailable = true;
      }
      let voteStateUnavailable = false;
      let replyStateUnavailable = false;
      try {
        await loadMyVotes(visibleComments);
      } catch (error) {
        console.error('Impossible de charger tes votes personnels.', error);
        myVotes = new Map();
        voteStateUnavailable = true;
      }
      let replyDataByComment = new Map();
      try {
        replyDataByComment = await loadReplyPreviews(visibleComments);
      } catch (error) {
        console.error('Impossible de charger les aperçus des réponses.', error);
        replyStateUnavailable = true;
      }
      renderList(list, visibleComments, refresh, includePostSelect, replyDataByComment);
      renderList(archiveList, archivedComments, refresh, includePostSelect, new Map());
      status.textContent = [
        voteTotalsUnavailable
          ? 'Les commentaires sont affichés, mais les totaux des votes sont temporairement indisponibles.'
          : '',
        voteStateUnavailable
          ? 'Les commentaires sont affichés, mais tes votes personnels sont temporairement indisponibles.'
          : '',
        replyStateUnavailable
          ? 'Les réponses sont temporairement indisponibles.'
          : '',
      ].filter(Boolean).join(' ');
    }

    container.insertBefore(
      createCommentForm(postId, refresh, includePostSelect),
      list,
    );
    refreshCallbacks.add(refresh);
    try {
      await refresh();
    } catch (error) {
      console.error('Impossible de charger les commentaires.', error);
      status.textContent =
        'Impossible de charger les commentaires depuis Supabase. Vérifie ta connexion internet puis recharge la page.';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    createSiteNavigation();
    const oauthError = consumeOAuthError();
    const pendingProvider = sessionStorage.getItem(pendingIdentityLinkKey);
    if (oauthError && pendingProvider) {
      accountMessage = getIdentityLinkErrorMessage(pendingProvider, oauthError);
      sessionStorage.removeItem(pendingIdentityLinkKey);
    }
    if (window.supabase?.createClient && supabaseUrl && anonKey) {
      try {
        authClient = window.supabase.createClient(supabaseUrl, anonKey);
        const { data, error } = await authClient.auth.getSession();
        if (error) throw error;
        authSession = data.session;
        currentUser = data.session?.user || null;
      } catch (error) {
        console.error('Impossible de restaurer la session du compte.', error);
      }
      if (authClient) {
        accountPanels.forEach(renderAccountPanel);
        authClient.auth.onAuthStateChange((_event, session) => {
          authSession = session;
          currentUser = session?.user || null;
          currentIdentities = null;
          accountIdentityError = '';
          accountPanels.forEach(renderAccountPanel);
          renderAccountPage();
          if (document.querySelector('[data-account-page]') && currentUser) {
            window.setTimeout(() => {
              refreshCurrentUser().then(renderAccountPage).catch((error) => {
                console.error('Impossible de charger les identités du compte.', error);
                accountIdentityError =
                  'Impossible de charger les identités. Recharge la page ou réessaie.';
                renderAccountPage();
              });
            }, 0);
          }
          refreshCallbacks.forEach((refresh) => {
            refresh().catch((error) => {
              console.error(
                'Impossible d’actualiser les actions du compte.',
                error,
              );
            });
          });
        });
      }
    } else {
      console.error(
        'La bibliothèque Supabase Auth ou sa configuration est manquante.',
      );
    }
    if (document.querySelector('[data-account-page]') && currentUser) {
      try {
        await refreshCurrentUser();
      } catch (error) {
        console.error('Impossible de charger les identités du compte.', error);
        accountIdentityError =
          'Impossible de charger les identités. Recharge la page ou réessaie.';
      }
    }
    renderAccountPage();
    if (
      currentUser &&
      sessionStorage.getItem(pendingIdentityLinkKey)
    ) {
      const provider = sessionStorage.getItem(pendingIdentityLinkKey);
      sessionStorage.removeItem(pendingIdentityLinkKey);
      try {
        await refreshCurrentUser();
        if (!currentIdentities.some((identity) => identity.provider === provider)) {
          accountMessage = getIdentityLinkErrorMessage(provider, {
            description:
              'Le fournisseur n’a pas confirmé la liaison. Cette identité est peut-être déjà associée à un autre compte.',
          });
        }
        renderAccountPage();
      } catch (error) {
        console.error('Impossible d’actualiser les identités du compte.', error);
        accountMessage = getIdentityLinkErrorMessage(provider, {
          description:
            'Impossible de vérifier le résultat de la liaison. Recharge la page et vérifie l’état du compte.',
        });
        renderAccountPage();
      }
    } else if (pendingProvider && !currentUser && !oauthError) {
      sessionStorage.removeItem(pendingIdentityLinkKey);
      accountMessage =
        'La liaison n’a pas pu être terminée car la session a expiré. Reconnecte-toi puis réessaie.';
      renderAccountPage();
    }
    document.querySelectorAll(
      '.comments-widget:not(.comments-page):not(.replies-page)',
    ).forEach(
      (container) => {
      initialize(container, container.dataset.postId, false);
      },
    );
    const commentsPage = document.querySelector('[data-comments-page]');
    if (commentsPage) initialize(commentsPage, '', true);
    const repliesPage = document.querySelector('[data-replies-page]');
    if (repliesPage) await renderRepliesPage(repliesPage);
    const adminPage = document.querySelector('[data-admin-page]');
    if (adminPage) await initializeAdminPage(adminPage);
  });
})();
