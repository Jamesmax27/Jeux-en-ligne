// ==========================================================================
// apercus.js — « Images du jeu » de la page d'un jeu (gabarits/jeu.html)
//
// La page montre 3 vrais moments de partie (scripts/apercus-jeu.mjs) dans une
// bande qui défile. Sans JavaScript, chaque image est un lien vers le fichier.
// Avec ce script, un toucher ouvre l'image en grand dans une fenêtre <dialog> :
// flèches (boutons, clavier ← →), glissé du doigt, Échap ou toucher hors de
// l'image pour fermer. Textes des boutons : data-* de la liste (5 langues).
// ==========================================================================

(() => {
  const liste = document.querySelector('.apercus-liste');
  if (!liste || typeof HTMLDialogElement !== 'function') return;
  const liens = [...liste.querySelectorAll('a.apercu')];
  if (!liens.length) return;

  const bouton = (classe, texte, symbole) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `apercu-grand-bouton ${classe}`;
    b.setAttribute('aria-label', texte);
    b.title = texte;
    b.textContent = symbole;
    return b;
  };

  // Fenêtre construite une seule fois, à la première ouverture.
  let fenetre = null, image = null, precedente = null, suivante = null, actuelle = 0;

  function construire() {
    fenetre = document.createElement('dialog');
    fenetre.className = 'apercu-grand';
    image = document.createElement('img');
    image.decoding = 'async';
    const fermer = bouton('apercu-fermer', liste.dataset.fermer || '×', '×');
    precedente = bouton('apercu-precedente', liste.dataset.precedente || '‹', '‹');
    suivante = bouton('apercu-suivante', liste.dataset.suivante || '›', '›');
    fenetre.append(image, precedente, suivante, fermer);
    document.body.append(fenetre);

    fermer.addEventListener('click', () => fenetre.close());
    precedente.addEventListener('click', () => montrer(actuelle - 1));
    suivante.addEventListener('click', () => montrer(actuelle + 1));
    // Toucher hors de l'image (sur le fond) : fermer.
    fenetre.addEventListener('click', (e) => { if (e.target === fenetre) fenetre.close(); });
    fenetre.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); montrer(actuelle - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); montrer(actuelle + 1); }
    });
    // Glissé du doigt vers la gauche ou la droite : image suivante ou précédente.
    let depart = null;
    image.addEventListener('pointerdown', (e) => { depart = { x: e.clientX, y: e.clientY }; });
    image.addEventListener('pointerup', (e) => {
      if (!depart) return;
      const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
      depart = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) montrer(actuelle + (dx < 0 ? 1 : -1));
    });
    // La page ne défile pas derrière la fenêtre.
    fenetre.addEventListener('close', () => document.documentElement.classList.remove('apercu-ouvert'));
  }

  function montrer(i) {
    actuelle = (i + liens.length) % liens.length;
    const vignette = liens[actuelle].querySelector('img');
    image.src = liens[actuelle].href;
    image.alt = vignette ? vignette.alt : '';
    const seule = liens.length < 2;
    precedente.hidden = seule;
    suivante.hidden = seule;
  }

  liens.forEach((lien, i) => {
    lien.addEventListener('click', (e) => {
      // Ctrl, Maj ou clic du milieu : comportement normal du lien (nouvel onglet…).
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (!fenetre) construire();
      montrer(i);
      document.documentElement.classList.add('apercu-ouvert');
      fenetre.showModal();
    });
  });
})();
