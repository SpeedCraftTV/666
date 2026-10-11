(function () {
  const config = window.BLOG_SUPABASE || {};
  const supabaseUrl = (config.url || '').replace(/\/$/, '');
  const anonKey = config.anonKey || '';
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
    post10: 'le guide du kikoo'
  };

  function getVisitorId() {
    let visitorId = localStorage.getItem('blog-comment-visitor-id');
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem('blog-comment-visitor-id', visitorId);
    }
    return visitorId;
  }

  function getStoredVote(commentId) {
    return localStorage.getItem(`blog-comment-vote-${commentId}`);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
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

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'ton pseudo :';
    const nameInput = document.createElement('input');
    nameInput.name = 'author_name';
    nameInput.type = 'text';
    nameInput.maxLength = 40;
    nameInput.required = true;
    nameInput.autocomplete = 'nickname';
    nameLabel.appendChild(nameInput);

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
    form.append(nameLabel, bodyLabel, submit);

    const status = createStatus(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const commentPostId = includePostSelect ? formData.get('post_id') : postId;
      const authorName = String(formData.get('author_name') || '').trim();
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
            body
          })
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
        console.error('Le commentaire a été publié, mais la liste n’a pas pu être actualisée.', error);
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

    const storedVote = getStoredVote(comment.id);
    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.className = `comment-action${storedVote === '1' ? ' selected' : ''}`;
    upButton.textContent = `⬆️ ${upCount}`;
    upButton.setAttribute('aria-label', `aimer ce commentaire, ${upCount} likes`);
    upButton.addEventListener('click', () => vote(comment.id, 1, refresh, [upButton, downButton]));

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.className = `comment-action${storedVote === '-1' ? ' selected' : ''}`;
    downButton.textContent = `⬇️ ${downCount}`;
    downButton.setAttribute('aria-label', `ne pas aimer ce commentaire, ${downCount} dislikes`);
    downButton.addEventListener('click', () => vote(comment.id, -1, refresh, [upButton, downButton]));

    const reportButton = document.createElement('button');
    reportButton.type = 'button';
    reportButton.className = 'comment-action report-action';
    reportButton.textContent = 'signaler aussi';
    reportButton.addEventListener('click', () => report(comment, refresh));

    actions.append(upButton, downButton, reportButton);
    card.appendChild(actions);
    return card;
  }

  async function vote(commentId, value, refresh, buttons) {
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const visitorId = getVisitorId();
      const voteQuery = new URLSearchParams({
        select: 'vote',
        comment_id: `eq.${commentId}`,
        visitor_id: `eq.${visitorId}`
      });
      const existingVotes = await request(`blog_comment_votes?${voteQuery}`);
      const existingVote = existingVotes[0]?.vote;

      if (existingVote === value) {
        const deleteQuery = new URLSearchParams({
          comment_id: `eq.${commentId}`,
          visitor_id: `eq.${visitorId}`
        });
        await request(`blog_comment_votes?${deleteQuery}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' }
        });
        localStorage.removeItem(`blog-comment-vote-${commentId}`);
      } else if (existingVotes.length > 0) {
        const updateQuery = new URLSearchParams({
          comment_id: `eq.${commentId}`,
          visitor_id: `eq.${visitorId}`
        });
        await request(`blog_comment_votes?${updateQuery}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ vote: value })
        });
        localStorage.setItem(`blog-comment-vote-${commentId}`, String(value));
      } else {
        await request('blog_comment_votes', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            comment_id: commentId,
            visitor_id: visitorId,
            vote: value
          })
        });
        localStorage.setItem(`blog-comment-vote-${commentId}`, String(value));
      }
    } catch (error) {
      console.error('Impossible d’enregistrer le vote.', error);
      window.alert(`vote impossible : ${error.message}`);
      return;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }

    try {
      await refresh();
    } catch (error) {
      console.error('Le vote a changé, mais la liste n’a pas pu être actualisée.', error);
      window.alert('vote mis à jour. recharge la page pour actualiser le total.');
    }
  }

  function addReportField(form, labelText, name, type, options = {}) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const field = options.multiline
      ? document.createElement('textarea')
      : document.createElement('input');
    field.name = name;
    field.required = options.required !== false;
    if (field instanceof HTMLInputElement) field.type = type;
    if (options.maxLength) field.maxLength = options.maxLength;
    if (options.multiline) field.rows = 5;
    if (options.autocomplete) field.autocomplete = options.autocomplete;
    label.appendChild(field);
    form.appendChild(label);
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
    const status = createStatus(form);
    addReportField(form, 'ton pseudo :', 'reporter_name', 'text', {
      maxLength: 80,
      autocomplete: 'nickname'
    });
    addReportField(form, 'ton e-mail pour recevoir une copie et être recontacté :', 'reporter_email', 'email', {
      maxLength: 254,
      autocomplete: 'email'
    });
    addReportField(form, 'pourquoi signales-tu ce commentaire ?', 'message', 'text', {
      maxLength: 2000,
      multiline: true
    });

    const honeypot = document.createElement('input');
    honeypot.name = 'company';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.className = 'report-honeypot';
    form.appendChild(honeypot);

    const consent = document.createElement('label');
    consent.className = 'report-consent';
    const consentCheckbox = document.createElement('input');
    consentCheckbox.type = 'checkbox';
    consentCheckbox.name = 'consent';
    consentCheckbox.required = true;
    consent.append(consentCheckbox, document.createTextNode(
      'j’accepte que ces informations soient utilisées pour traiter le signalement et envoyer une copie par e-mail.'
    ));
    form.appendChild(consent);

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
    form.appendChild(buttons);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!supabaseUrl || !anonKey) {
        status.textContent = 'connexion Supabase non configurée.';
        return;
      }

      const formData = new FormData(form);
      submit.disabled = true;
      status.textContent = 'envoi du signalement...';
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/report-comment`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            comment_id: comment.id,
            visitor_id: getVisitorId(),
            reporter_name: String(formData.get('reporter_name') || '').trim(),
            reporter_email: String(formData.get('reporter_email') || '').trim(),
            message: String(formData.get('message') || '').trim(),
            company: String(formData.get('company') || '')
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Supabase (${response.status})`);
        status.textContent = 'signalement envoyé ! une copie a été envoyée à ton adresse e-mail.';
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
    return request(`blog_comments?select=id,post_id,author_name,body,created_at,blog_comment_votes(vote)&order=created_at.desc${filters}`);
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
        throw new Error('Renseigne comments-config.js avec les informations publiques de ton projet Supabase.');
      }
      const comments = await loadComments(postId);
      renderList(list, comments, refresh, includePostSelect);
    }

    container.insertBefore(createCommentForm(postId, refresh, includePostSelect), list);
    try {
      await refresh();
    } catch (error) {
      console.error('Impossible de charger les commentaires.', error);
      const status = createStatus(container);
      status.textContent = 'commentaires indisponibles. la connexion Supabase doit être configurée et le site ouvert depuis un serveur web.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.comments-widget:not(.comments-page)').forEach((container) => {
      initialize(container, container.dataset.postId, false);
    });
    const commentsPage = document.querySelector('[data-comments-page]');
    if (commentsPage) initialize(commentsPage, '', true);
  });
})();
