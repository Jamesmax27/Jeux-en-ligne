// ==========================================================================
// Jeux-en-ligne — page « Mentions légales » (mentions-legales.html)
// Textes traduits : clés « legal.* » de i18n/site/<langue>.json.
// Les informations (éditeur, hébergeur…) sont écrites dans la page elle-même.
// ==========================================================================

import { activerHorsLigne } from './hors-ligne.js';
import { t, demarrerLangue, surChangementLangue, majSeo } from './langue.js';

function afficherSeo() {
  majSeo({ titre: t('legal.titreDocument'), description: t('legal.description') });
}

await demarrerLangue(document.getElementById('langue'));
afficherSeo();
surChangementLangue(afficherSeo);
activerHorsLigne();
