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

  // form
  document.addEventListener('DOMContentLoaded', function(){
    const form = document.getElementById('contact-form');
    if (!form) return;
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      const nom = form.elements['nom'].value || '(inconnu)';
      // intentionnaly plein de faute pour l'humour
      alert('Merci ' + nom + '! Ton message a bien été (presque) envoyé. On te repondras bientot.');
      form.reset();
    });
  });
})();