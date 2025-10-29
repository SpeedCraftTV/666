// Comportement minimal: compteur de visiteurs (stocké en localStorage) et gestion du form contact
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

  // form
  document.addEventListener('DOMContentLoaded', function(){
    const form = document.getElementById('contact-form');
    if (!form) return;
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
  const nom = form.elements['nom'].value || '(inconnu)';
  // style kikoo pour le message
  alert('kikoo ' + nom + ' !! ton messaj a bien eté (preske) envoyé ♡ on te repondras bientot lol ^^');
      form.reset();
    });
  });
})();