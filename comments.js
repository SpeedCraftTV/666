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
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase (${response.status}): ${details}`);
    }
    return response.status === 204 ? null : response.json();
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
        form.reset();
        status.textContent = 'commentaire publié !';
        await onSubmitted();
      } catch (error) {
        console.error('Impossible de publier le commentaire.', error);
        status.textContent = 'publication impossible. verifie la configuration Supabase et réessaie.';
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
    upButton.disabled = Boolean(storedVote);
    upButton.addEventListener('click', () => vote(comment.id, 1, refresh));

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.className = `comment-action${storedVote === '-1' ? ' selected' : ''}`;
    downButton.textContent = `⬇️ ${downCount}`;
    downButton.setAttribute('aria-label', `ne pas aimer ce commentaire, ${downCount} dislikes`);
    downButton.disabled = Boolean(storedVote);
    downButton.addEventListener('click', () => vote(comment.id, -1, refresh));

    const reportButton = document.createElement('button');
    reportButton.type = 'button';
    reportButton.className = 'comment-action report-action';
    reportButton.textContent = 'signaler aussi';
    reportButton.addEventListener('click', () => report(comment.id, refresh));

    actions.append(upButton, downButton, reportButton);
    card.appendChild(actions);
    return card;
  }

  async function vote(commentId, value, refresh) {
    try {
      await request('blog_comment_votes?on_conflict=comment_id%2Cvisitor_id', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          comment_id: commentId,
          visitor_id: getVisitorId(),
          vote: value
        })
      });
      localStorage.setItem(`blog-comment-vote-${commentId}`, String(value));
      await refresh();
    } catch (error) {
      console.error('Impossible d’enregistrer le vote.', error);
      window.alert('vote impossible. verifie la configuration Supabase et réessaie.');
    }
  }

  async function report(commentId, refresh) {
    if (!window.confirm('signaler ce commentaire aux responsables du site ?')) return;
    try {
      await request('blog_comment_reports', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          comment_id: commentId,
          visitor_id: getVisitorId()
        })
      });
      window.alert('merci, le commentaire a été signalé.');
      await refresh();
    } catch (error) {
      console.error('Impossible de signaler le commentaire.', error);
      window.alert('signalement impossible. tu as peut-être déjà signalé ce commentaire.');
    }
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
    document.querySelectorAll('.comments-widget').forEach((container) => {
      initialize(container, container.dataset.postId, false);
    });
    const commentsPage = document.querySelector('[data-comments-page]');
    if (commentsPage) initialize(commentsPage, '', true);
  });
})();
