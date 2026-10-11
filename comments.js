(function () {
  const config = window.BLOG_SUPABASE || {};
  const supabaseUrl = (config.url || '').replace(/\/$/, '');
  const anonKey = config.anonKey || '';
  const scriptUrl = document.currentScript?.src || window.location.href;
  const siteBaseUrl = new URL('.', scriptUrl);
  const productionSiteUrl = config.siteUrl || 'https://speedcrafttv.github.io/666/';
  let authClient = null;
  let authSession = null;
  let currentUser = null;
  let myVotes = new Map();
  const accountPanels = new Set();
  const refreshCallbacks = new Set();
  const postTitles = {
    post1: 'le commencement',
    post2: 'encore un post',
    post3: 'tips & tricks',
    post4: 'la nuit du modem',
    post5: "collection d'icones 16x16",
    post6: 'trollolol: la quete du pixel perdu',
    post7: 'les memes interdits',
    post8: 'la photo qui parle',
    post9: 'fail hardware #epik',
    post10: 'le guide du kikoo',
  };

  function getSiteRedirectUrl() {
    if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      return productionSiteUrl;
    }
    return siteBaseUrl.href;
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

  function renderAccountPanel(panel) {
    panel.replaceChildren();
    if (currentUser) {
      const identity = document.createElement('span');
      identity.textContent = `connecté·e : ${getNickname(currentUser)}`;
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'comment-action';
      logout.textContent = 'se déconnecter';
      logout.addEventListener('click', async () => {
        const { error } = await authClient.auth.signOut();
        if (error) {
          console.error('Impossible de se déconnecter.', error);
          window.alert(`déconnexion impossible : ${error.message}`);
        }
      });
      panel.append(identity, logout);
      return;
    }

    const signIn = document.createElement('button');
    signIn.type = 'button';
    signIn.className = 'comment-action';
    signIn.textContent = 'créer un compte / se connecter';
    signIn.addEventListener('click', openAccountDialog);
    panel.append(signIn);
  }

  function createSiteNavigation() {
    if (document.querySelector('.site-navigation')) return;

    const rootPrefix = window.location.pathname.includes('/posts/') ? '../' : './';
    const navigation = document.createElement('nav');
    navigation.className = 'site-navigation';
    navigation.setAttribute('aria-label', 'navigation principale');
    [
      ['accueil', 'index.html'],
      ['à propos', 'about.html'],
      ['contact', 'contact.html'],
      ['posts', 'posts/index.html'],
      ['commentaires', 'comments.html'],
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
        'le service de comptes n’est pas disponible. recharge la page ou réessaie plus tard.',
      );
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'report-dialog account-dialog';
    const heading = document.createElement('h2');
    const form = document.createElement('form');
    form.className = 'comment-form';
    const status = createStatus(form);
    const googleSignIn = document.createElement('button');
    googleSignIn.type = 'button';
    googleSignIn.className = 'comment-action google-sign-in';
    googleSignIn.textContent = 'continuer avec Google';
    googleSignIn.addEventListener('click', async () => {
      googleSignIn.disabled = true;
      status.textContent = 'connexion avec Google...';
      try {
        const { error } = await authClient.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: getSiteRedirectUrl() },
        });
        if (error) throw error;
      } catch (error) {
        console.error('Connexion Google impossible.', error);
        status.textContent = `connexion Google impossible : ${error.message}`;
        googleSignIn.disabled = false;
      }
    });
    const divider = document.createElement('p');
    divider.className = 'account-dialog-divider';
    divider.textContent = 'ou avec ton e-mail';
    const nicknameLabel = document.createElement('label');
    nicknameLabel.textContent = 'ton pseudo :';
    const nicknameInput = document.createElement('input');
    nicknameInput.name = 'nickname';
    nicknameInput.type = 'text';
    nicknameInput.maxLength = 40;
    nicknameInput.autocomplete = 'nickname';
    nicknameLabel.appendChild(nicknameInput);
    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'ton e-mail :';
    const emailInput = document.createElement('input');
    emailInput.name = 'email';
    emailInput.type = 'email';
    emailInput.required = true;
    emailInput.autocomplete = 'email';
    emailLabel.appendChild(emailInput);
    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'mot de passe (8 caractères minimum) :';
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
    cancel.textContent = 'annuler';
    cancel.addEventListener('click', () => dialog.close());
    let mode = 'signup';

    function setMode(nextMode) {
      mode = nextMode;
      const creatingAccount = mode === 'signup';
      heading.textContent = creatingAccount ? 'créer un compte' : 'se connecter';
      nicknameLabel.hidden = !creatingAccount;
      nicknameInput.required = creatingAccount;
      passwordInput.minLength = creatingAccount ? 8 : 1;
      passwordInput.autocomplete = creatingAccount ? 'new-password' : 'current-password';
      submit.textContent = creatingAccount ? 'créer le compte' : 'se connecter';
      switchMode.textContent = creatingAccount ? 'j’ai déjà un compte' : 'créer un compte';
      status.textContent = '';
    }

    switchMode.addEventListener('click', () => {
      setMode(mode === 'signup' ? 'signin' : 'signup');
    });
    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    actions.append(submit, switchMode, cancel);
    form.append(
      googleSignIn,
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
      status.textContent = mode === 'signup' ? 'création du compte...' : 'connexion...';
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
          status.textContent = 'compte créé. confirme ton adresse avec le lien reçu par e-mail, puis connecte-toi.';
          return;
        }
        status.textContent = 'connecté·e !';
        dialog.close();
      } catch (error) {
        console.error('Authentification impossible.', error);
        status.textContent = `opération impossible : ${error.message}`;
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

  async function requireAccount() {
    if (currentUser) return true;
    openAccountDialog();
    return false;
  }

  function createCommentForm(postId, onSubmitted, includePostSelect) {
    const form = document.createElement('form');
    form.className = 'comment-form';

    if (includePostSelect) {
      const postLabel = document.createElement('label');
      postLabel.textContent = 'article :';
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
    bodyLabel.textContent = 'ton commentaire :';
    const bodyInput = document.createElement('textarea');
    bodyInput.name = 'body';
    bodyInput.maxLength = 500;
    bodyInput.rows = 4;
    bodyInput.required = true;
    bodyLabel.appendChild(bodyInput);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'publier le commentaire';
    form.append(bodyLabel, submit);

    const status = createStatus(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!await requireAccount()) {
        status.textContent = 'connecte-toi ou crée un compte pour commenter.';
        return;
      }
      const formData = new FormData(form);
      const commentPostId = includePostSelect ? formData.get('post_id') : postId;
      const authorName = getNickname(currentUser);
      const body = String(formData.get('body') || '').trim();
      if (!authorName || !body) {
        status.textContent = 'ajoute un pseudo et un commentaire avant de publier.';
        return;
      }

      submit.disabled = true;
      status.textContent = 'publication en cours...';
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
        status.textContent = 'publication impossible. verifie la configuration Supabase et réessaie.';
        submit.disabled = false;
        return;
      }

      form.reset();
      status.textContent = 'commentaire publié !';
      try {
        await onSubmitted();
      } catch (error) {
        console.error(
          'Le commentaire a été publié, mais la liste n’a pas pu être actualisée.',
          error,
        );
        status.textContent = 'commentaire publié ! recharge la page pour actualiser la liste.';
      } finally {
        submit.disabled = false;
      }
    });
    return form;
  }

  function formatDate(value) {
    return new Date(value).toLocaleString('fr-FR');
  }

  function createCommentCard(comment, refresh) {
    const card = document.createElement('article');
    card.className = 'visitor-comment';

    const heading = document.createElement('h3');
    heading.textContent = `${comment.author_name} — ${formatDate(comment.created_at)}`;
    card.appendChild(heading);

    const body = document.createElement('p');
    body.textContent = comment.body;
    card.appendChild(body);

    const votes = comment.blog_comment_votes || [];
    const upCount = votes.filter((item) => item.vote === 1).length;
    const downCount = votes.filter((item) => item.vote === -1).length;
    const actions = document.createElement('div');
    actions.className = 'comment-actions';

    const storedVote = myVotes.get(comment.id);
    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.className = `comment-action${storedVote === 1 ? ' selected' : ''}`;
    upButton.textContent = `⬆️ ${upCount}`;
    upButton.setAttribute(
      'aria-label',
      `aimer ce commentaire, ${upCount} likes`,
    );

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.className = `comment-action${storedVote === -1 ? ' selected' : ''}`;
    downButton.textContent = `⬇️ ${downCount}`;
    downButton.setAttribute(
      'aria-label',
      `ne pas aimer ce commentaire, ${downCount} dislikes`,
    );
    upButton.addEventListener('click', async () => {
      if (await requireAccount()) {
        vote(comment.id, 1, refresh, [upButton, downButton]);
      }
    });
    downButton.addEventListener('click', async () => {
      if (await requireAccount()) {
        vote(comment.id, -1, refresh, [upButton, downButton]);
      }
    });

    const reportButton = document.createElement('button');
    reportButton.type = 'button';
    reportButton.className = 'comment-action report-action';
    reportButton.textContent = 'signaler aussi';
    reportButton.addEventListener('click', async () => {
      if (await requireAccount()) report(comment);
    });

    actions.append(upButton, downButton, reportButton);
    card.appendChild(actions);
    return card;
  }

  async function vote(commentId, value, refresh, buttons) {
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      const voteQuery = new URLSearchParams({
        select: 'vote',
        comment_id: `eq.${commentId}`,
        user_id: `eq.${currentUser.id}`,
      });
      const existingVotes = await request(`blog_comment_votes?${voteQuery}`);
      const existingVote = existingVotes[0]?.vote;

      if (existingVote === value) {
        const deleteQuery = new URLSearchParams({
          comment_id: `eq.${commentId}`,
          user_id: `eq.${currentUser.id}`,
        });
        await request(`blog_comment_votes?${deleteQuery}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
      } else if (existingVotes.length > 0) {
        const updateQuery = new URLSearchParams({
          comment_id: `eq.${commentId}`,
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
            comment_id: commentId,
            visitor_id: getVoterId(),
            vote: value,
            user_id: currentUser.id,
          }),
        });
      }
    } catch (error) {
      console.error('Impossible d’enregistrer le vote.', error);
      window.alert(`vote impossible : ${error.message}`);
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
        'vote mis à jour. recharge la page pour actualiser le total.',
      );
    }
  }

  async function report(comment) {
    const dialog = document.createElement('dialog');
    dialog.className = 'report-dialog';
    const form = document.createElement('form');
    form.className = 'comment-form';

    const heading = document.createElement('h2');
    heading.textContent = 'signaler ce commentaire';
    const details = document.createElement('p');
    details.textContent = `article : ${postTitles[comment.post_id] || comment.post_id}`;
    const messageLabel = document.createElement('label');
    messageLabel.textContent = 'pourquoi signales-tu ce commentaire ?';
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
    consent.append(
      consentCheckbox,
      document.createTextNode(
        `j’accepte que mon pseudo et l’adresse ${currentUser.email} soient utilisés pour traiter ce signalement et m’envoyer une copie par e-mail.`,
      ),
    );
    const buttons = document.createElement('div');
    buttons.className = 'comment-actions';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'envoyer le signalement';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'comment-action';
    cancel.textContent = 'annuler';
    cancel.addEventListener('click', () => dialog.close());
    buttons.append(submit, cancel);
    form.append(messageLabel, consent, buttons);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!supabaseUrl || !anonKey) {
        status.textContent = 'connexion Supabase non configurée.';
        return;
      }

      submit.disabled = true;
      status.textContent = 'envoi du signalement...';
      try {
        const { data: sessionData, error: sessionError } = await authClient.auth
          .getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          throw new Error('ta session a expiré. reconnecte-toi puis réessaie.');
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
            message: String(formData.get('message') || '').trim(),
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || `Supabase (${response.status})`);
        }
        status.textContent = 'signalement envoyé ! une copie a été envoyée à ton adresse de compte.';
        submit.disabled = true;
        setTimeout(() => dialog.close(), 1800);
      } catch (error) {
        console.error('Impossible de signaler le commentaire.', error);
        status.textContent = `signalement impossible : ${error.message}`;
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
    return request(
      `blog_comments?select=id,post_id,author_name,body,created_at,blog_comment_votes(vote)&order=created_at.desc${filters}`,
    );
  }

  async function loadMyVotes(comments) {
    myVotes = new Map();
    if (!currentUser || !comments.length) return;
    const commentIds = comments.map((comment) => comment.id);
    const query = new URLSearchParams({
      select: 'comment_id,vote',
      user_id: `eq.${currentUser.id}`,
      comment_id: `in.(${commentIds.join(',')})`,
    });
    const votes = await request(`blog_comment_votes?${query}`);
    myVotes = new Map(votes.map((item) => [item.comment_id, item.vote]));
  }

  function renderList(container, comments, refresh, grouped) {
    container.replaceChildren();
    if (!comments.length) {
      const empty = document.createElement('p');
      empty.textContent = 'pas encore de commentaire... sois le premier !';
      container.appendChild(empty);
      return;
    }

    let previousPostId = '';
    comments.forEach((comment) => {
      if (grouped && comment.post_id !== previousPostId) {
        const postTitle = document.createElement('h2');
        postTitle.textContent = postTitles[comment.post_id] || comment.post_id;
        container.appendChild(postTitle);
        previousPostId = comment.post_id;
      }
      container.appendChild(createCommentCard(comment, refresh));
    });
  }

  async function initialize(container, postId, includePostSelect) {
    const heading = document.createElement('h2');
    heading.textContent = includePostSelect ? 'tous les commentaires' : 'commentaires des visiteurs';
    container.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'comments-list';
    container.appendChild(list);

    async function refresh() {
      if (!supabaseUrl || !anonKey || supabaseUrl.includes('VOTRE-PROJET')) {
        throw new Error(
          'Renseigne comments-config.js avec les informations publiques de ton projet Supabase.',
        );
      }
      const comments = await loadComments(postId);
      await loadMyVotes(comments);
      renderList(list, comments, refresh, includePostSelect);
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
      const status = createStatus(container);
      status.textContent = 'commentaires indisponibles. la connexion Supabase doit être configurée et le site ouvert depuis un serveur web.';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    createSiteNavigation();
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
          accountPanels.forEach(renderAccountPanel);
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
    document.querySelectorAll('.comments-widget:not(.comments-page)').forEach(
      (container) => {
      initialize(container, container.dataset.postId, false);
      },
    );
    const commentsPage = document.querySelector('[data-comments-page]');
    if (commentsPage) initialize(commentsPage, '', true);
  });
})();
