// Comportement du site : compteur local et envoi du formulaire de contact.
(function(){
  // compteur
  try {
    let c = Number(localStorage.getItem('visiteurs_v1') || '0');
    c += 1;
    localStorage.setItem('visiteurs_v1', String(c));
    const el = document.getElementById('counter');
    if (el) el.textContent = c;
  } catch(e) {
    // ignore
  }

  // --- audio: small webaudio-based sounds (no external files) ---
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { audioCtx = null; }
    }
    return audioCtx;
  }

  function playClick() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 800;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    o.start(now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.stop(now + 0.13);
  }

  function playModemShort() {
    const ctx = ensureAudio(); if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(600, now);
    g.gain.value = 0.0001; o.connect(g); g.connect(ctx.destination);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    o.start(now);
    // a quick descending chirp
    o.frequency.exponentialRampToValueAtTime(250, now + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    o.stop(now + 1.02);
  }

  // play small click on link clicks
  document.addEventListener('click', function(ev){
    const a = ev.target.closest && ev.target.closest('a');
    if (a) {
      try { playClick(); } catch(e) { /* ignore */ }
    }
  }, true);

  // if we're on the post4 page, play small modem 'riff' on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function(){
    try {
      if (location.pathname && location.pathname.toLowerCase().includes('post4')) {
        // play a few modem chirps spaced out
        playModemShort();
        setTimeout(playModemShort, 800);
        setTimeout(playModemShort, 1600);
      }
    } catch(e) {}
  });

  document.addEventListener('DOMContentLoaded', function(){
    const form = document.getElementById('contact-form');
    if (!form) return;
    const message = form.elements.message;
    const characterCount = form.querySelector('[data-character-count="contact-message"]');
    const updateCharacterCount = () => {
      const remaining = message.maxLength - message.value.length;
      characterCount.textContent =
        `${message.value.length} / ${message.maxLength} caractères (${remaining} restants)`;
    };
    message.addEventListener('input', updateCharacterCount);
    form.addEventListener('reset', () => window.setTimeout(updateCharacterCount));
    updateCharacterCount();
    const status = form.querySelector('[data-contact-status]');
    const submit = form.querySelector('[type="submit"]');
    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      if (location.protocol === 'file:') {
        status.textContent = 'Ouvre le site avec le serveur local (http://localhost:8000 ou http://127.0.0.1:8765), pas directement depuis le fichier contact.html.';
        return;
      }
      if (!window.BLOG_SUPABASE?.url || !window.BLOG_SUPABASE?.anonKey) {
        status.textContent = 'Le formulaire est indisponible : la configuration Supabase manque.';
        return;
      }

      submit.disabled = true;
      status.textContent = 'Envoi du message…';
      try {
        const response = await fetch(
          `${window.BLOG_SUPABASE.url.replace(/\/$/, '')}/functions/v1/contact-message`,
          {
            method: 'POST',
            headers: {
              apikey: window.BLOG_SUPABASE.anonKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: form.elements.nom.value.trim(),
              email: form.elements.email.value.trim(),
              message: form.elements.message.value.trim(),
              company: form.elements.company.value,
            }),
          },
        );
        const responseBody = await response.text();
        let result = {};
        if (responseBody) {
          try {
            result = JSON.parse(responseBody);
          } catch {
            throw new Error('Le service de contact a renvoyé une réponse illisible. Réessaie plus tard.');
          }
        }
        if (response.status === 404) {
          throw new Error('Le service de contact n’est pas encore déployé sur Supabase. Consulte le README ou contacte directement minicastorbot@gmail.com.');
        }
        if (!response.ok) {
          throw new Error(result.error || result.message || 'Le message n’a pas pu être envoyé.');
        }
        form.reset();
        status.textContent = 'Message envoyé à Mini Castor. Merci !';
      } catch (error) {
        console.error('Envoi du formulaire de contact impossible.', error);
        status.textContent = `${error.message || 'Impossible de joindre le service de contact.'} Tu peux aussi écrire directement à minicastorbot@gmail.com.`;
      } finally {
        submit.disabled = false;
      }
    });
  });
})();