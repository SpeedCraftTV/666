// posts/search.js — client-side search by text + tag filters
(function () {
  async function loadData() {
    const res = await fetch('data.json');
    const data = await res.json();
    return data;
  }

  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }

  function formatDate(date) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }

  function renderTags(posts) {
    const tagSet = new Set();
    posts.forEach(p => p.tags.forEach(t => tagSet.add(t)));
    const tags = Array.from(tagSet).sort();
    const container = q('#tag-filters');
    container.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.textContent = 'tout';
    allBtn.className = 'tag-btn active';
    allBtn.dataset.tag = '';
    container.appendChild(allBtn);
    allBtn.addEventListener('click', () => {
      qa('#tag-filters .tag-btn').forEach(b => b.classList.remove('active'));
      allBtn.classList.add('active');
      applyFilters();
    });
    tags.forEach(t => {
      const b = document.createElement('button');
      b.textContent = t;
      b.className = 'tag-btn';
      b.dataset.tag = t;
      b.addEventListener('click', () => {
        const active = b.classList.toggle('active');
        // disable the 'Tous' button
        const all = q('#tag-filters .tag-btn[data-tag=""]');
        if (active) { all.classList.remove('active'); }
        else { /* if no tag active, re-enable Tous */
          const any = qa('#tag-filters .tag-btn.active').some(x => x.dataset.tag !== '');
          if (!any) all.classList.add('active');
        }
        applyFilters();
      });
      container.appendChild(b);
    });
  }

  function renderList(posts) {
    const list = q('#posts-list');
    list.innerHTML = '';
    if (posts.length === 0) {
      list.innerHTML = '<p>aucun post trouvé... :c</p>';
      return;
    }
    posts.forEach(p => {
      const div = document.createElement('div');
      div.className = 'post';
      // thumbnail (if provided)
      if (p.thumb) {
        const img = document.createElement('img');
        img.src = p.thumb;
        img.alt = p.title + ' thumbnail';
        img.style.maxWidth = '120px';
        img.style.marginRight = '10px';
        img.style.float = 'left';
        img.style.border = '3px solid #222';
        div.appendChild(img);
      }
      const title = document.createElement('h2');
      const a = document.createElement('a');
      a.href = p.url;
      a.textContent = p.title;
      title.appendChild(a);
      const ex = document.createElement('p');
      ex.textContent = p.excerpt;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = `posté le ${formatDate(p.date)} — tags: ${p.tags.join(', ')}`;
      div.appendChild(title);
      div.appendChild(ex);
      div.appendChild(meta);
      // clear float
      const clear = document.createElement('div');
      clear.style.clear = 'both';
      div.appendChild(clear);
      list.appendChild(div);
    });
  }

  let POSTS = [];

  function getActiveTags() {
    return qa('#tag-filters .tag-btn.active')
      .map(b => b.dataset.tag)
      .filter(t => t && t.length > 0);
  }

  function applyFilters() {
    const txt = q('#search-input').value.trim().toLowerCase();
    const activeTags = getActiveTags();
    let filtered = POSTS.filter(p => {
      // text match in title / excerpt / tags
      const hay = (p.title + ' ' + p.excerpt + ' ' + p.tags.join(' ')).toLowerCase();
      const textMatch = txt === '' || hay.includes(txt);
      const tagMatch = activeTags.length === 0 || activeTags.every(t => p.tags.includes(t));
      return textMatch && tagMatch;
    });
    // sort by date desc
    filtered.sort((a,b) => b.date.localeCompare(a.date));
    renderList(filtered);
  }

  // init
  window.addEventListener('DOMContentLoaded', async function () {
    try {
      POSTS = await loadData();
      renderTags(POSTS);
      renderList(POSTS);
      q('#search-input').addEventListener('input', () => applyFilters());
      q('#clear-filters').addEventListener('click', () => {
        q('#search-input').value = '';
        qa('#tag-filters .tag-btn').forEach(b => b.classList.remove('active'));
        q('#tag-filters .tag-btn[data-tag=""]').classList.add('active');
        applyFilters();
      });
    } catch (e) {
  console.error('erreur chargement posts/data.json', e);
  q('#posts-list').innerHTML = '<p>impossible de charger la liste des posts... brrr</p>';
    }
  });
})();
