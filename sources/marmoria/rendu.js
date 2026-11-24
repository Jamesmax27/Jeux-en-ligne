/* ==========================================================================
   Marmoria — rendu isométrique (couche 2 sur 3)

   Le rendu lit l'état de la simulation sans jamais le modifier. Canvas 2D limité
   à la zone visible ; isométrie 2:1 ; zoom à 3 paliers (×0,5, ×1, ×2) ; rotation
   par quarts de tour : les dessins restent les mêmes, seuls l'ordre d'affichage et
   les coordonnées changent (cahier des charges, section 3.1). Les marcheurs sont
   interpolés entre deux ticks (alpha).
   ========================================================================== */
(function (racine) {
  'use strict';

  var ZOOMS = [0.5, 1, 2];
  var DS = null, SIM = null;

  function Rendu(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.e = null;
    this.cam = { x: 0, y: 0, z: 1, rot: 0 };
    this.W = 1; this.H = 1; this.dpr = 1;
    this.calque = null;          // null, 'eau', 'feu', 'dommages'
    this.apercu = null;          // { type, cases: [{ x, y, ok }] }
    this.selection = 0;          // id du bâtiment choisi
    this.temps = 0;              // millisecondes (animations)
    this.sansInterface = false;  // affiche : pas d'icônes d'arrêt
    this._bucket = new Map();
  }

  // --- Rotation ---------------------------------------------------------------
  // Case (x, y) → case affichée (rx, ry), pour une rotation de r quarts de tour.
  Rendu.prototype.tourner = function (x, y) {
    var N = this.e.N - 1;
    switch (this.cam.rot) {
      case 1: return [N - y, x];
      case 2: return [N - x, N - y];
      case 3: return [y, N - x];
      default: return [x, y];
    }
  };
  Rendu.prototype.detourner = function (rx, ry) {
    var N = this.e.N - 1;
    switch (this.cam.rot) {
      case 1: return [ry, N - rx];
      case 2: return [N - rx, N - ry];
      case 3: return [N - ry, rx];
      default: return [rx, ry];
    }
  };
  // Point continu (centre de case = x + 0,5) → monde (pixels au zoom 1).
  Rendu.prototype.monde = function (cx, cy) {
    var N = this.e.N, rx, ry;
    switch (this.cam.rot) {
      case 1: rx = N - cy; ry = cx; break;
      case 2: rx = N - cx; ry = N - cy; break;
      case 3: rx = cy; ry = N - cx; break;
      default: rx = cx; ry = cy;
    }
    return [(rx - ry) * 32, (rx + ry) * 16];
  };
  Rendu.prototype.ecran = function (wx, wy) {
    var z = this.cam.z;
    return [(wx - this.cam.x) * z + this.W / 2, (wy - this.cam.y) * z + this.H / 2];
  };
  // Écran → case de la grille (non tournée), ou null hors carte.
  Rendu.prototype.versCase = function (sx, sy) {
    if (!this.e) return null;
    var z = this.cam.z, wx = (sx - this.W / 2) / z + this.cam.x, wy = (sy - this.H / 2) / z + this.cam.y;
    var rx = Math.floor((wy / 16 + wx / 32) / 2), ry = Math.floor((wy / 16 - wx / 32) / 2);
    var N = this.e.N;
    if (rx < 0 || ry < 0 || rx >= N || ry >= N) return null;
    return this.detourner(rx, ry);
  };
  Rendu.prototype.versEcran = function (x, y) {
    var m = this.monde(x + 0.5, y + 0.5);
    return this.ecran(m[0], m[1]);
  };
  Rendu.prototype.centrerSur = function (x, y) {
    var m = this.monde(x + 0.5, y + 0.5);
    this.cam.x = m[0]; this.cam.y = m[1];
    this.limiter();
  };
  Rendu.prototype.limiter = function () {
    if (!this.e) return;
    var N = this.e.N;
    this.cam.x = Math.max(-N * 32, Math.min(N * 32, this.cam.x));
    this.cam.y = Math.max(0, Math.min(N * 32, this.cam.y));
  };
  Rendu.prototype.zoomer = function (sens, sx, sy) {
    var k = ZOOMS.indexOf(this.cam.z), n = Math.max(0, Math.min(ZOOMS.length - 1, k + sens));
    if (n === k) return false;
    if (sx === undefined) { sx = this.W / 2; sy = this.H / 2; }
    var z0 = this.cam.z, z1 = ZOOMS[n];
    // Le point sous le doigt reste en place.
    var wx = (sx - this.W / 2) / z0 + this.cam.x, wy = (sy - this.H / 2) / z0 + this.cam.y;
    this.cam.z = z1;
    this.cam.x = wx - (sx - this.W / 2) / z1;
    this.cam.y = wy - (sy - this.H / 2) / z1;
    this.limiter();
    return true;
  };
  Rendu.prototype.pivoter = function (sens) {
    // Le centre de l'écran reste sur la même case.
    var c = this.versCase(this.W / 2, this.H / 2);
    this.cam.rot = (this.cam.rot + (sens || 1) + 4) % 4;
    if (c) this.centrerSur(c[0], c[1]);
    this._mini = null;
  };
  Rendu.prototype.redimensionner = function (w, h, dpr) {
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    DS.reglerDPR(dpr);
  };

  // --- Dessin d'une image ---------------------------------------------------------
  Rendu.prototype.poser = function (s, sx, sy) {
    if (!s) return;
    var z = this.cam.z;
    this.ctx.drawImage(s.c, sx + s.ox * z, sy + s.oy * z, s.w * z, s.h * z);
  };

  function couleurRisque(v) {
    // 0 → vert, 50 → jaune, 100 → rouge
    var r = v < 50 ? Math.round(80 + v * 3.5) : 255, g = v < 50 ? 200 : Math.round(200 - (v - 50) * 3.2);
    return 'rgb(' + r + ',' + Math.max(40, g) + ',60)';
  }
  var COULEUR_CAT = { logement: '#c9a06a', eau: '#4a86c0', alimentation: '#c98a2b', religion: '#efe7d6', divertissement: '#8e5aa8', administration: '#5a7397', securite: '#b03a2e', routes: '#c9bfa8' };

  // Colonne d'un calque : hauteur et couleur doublent l'information (section 17.7).
  Rendu.prototype.colonne = function (sx, sy, h, couleur) {
    var ctx = this.ctx, z = this.cam.z, w = 9 * z, d = 4.5 * z, H = h * z;
    ctx.fillStyle = DS.teinte(couleur, 0.9);
    ctx.beginPath(); ctx.moveTo(sx - w, sy); ctx.lineTo(sx, sy + d); ctx.lineTo(sx, sy + d - H); ctx.lineTo(sx - w, sy - H); ctx.fill();
    ctx.fillStyle = DS.teinte(couleur, 0.68);
    ctx.beginPath(); ctx.moveTo(sx + w, sy); ctx.lineTo(sx, sy + d); ctx.lineTo(sx, sy + d - H); ctx.lineTo(sx + w, sy - H); ctx.fill();
    ctx.fillStyle = DS.teinte(couleur, 1.1);
    ctx.beginPath(); ctx.moveTo(sx - w, sy - H); ctx.lineTo(sx, sy - d - H); ctx.lineTo(sx + w, sy - H); ctx.lineTo(sx, sy + d - H); ctx.fill();
  };

  Rendu.prototype.dessiner = function (alpha) {
    var e = this.e, ctx = this.ctx, z = this.cam.z, W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#3a4a2e';
    ctx.fillRect(0, 0, W, H);
    if (!e) return;
    var N = e.N, T = SIM.T, R = SIM.R, self = this, temps = this.temps;
    var frameEau = Math.floor(temps / 450) % 4, frame = Math.floor(temps / 220) % 3, frame2 = Math.floor(temps / 400) % 2;
    // Zone visible en cases affichées.
    var coins = [[0, 0], [W, 0], [0, H], [W, H]].map(function (p) {
      var wx = (p[0] - W / 2) / z + self.cam.x, wy = (p[1] - H / 2) / z + self.cam.y;
      return [(wy / 16 + wx / 32) / 2, (wy / 16 - wx / 32) / 2];
    });
    var rxa = Math.max(0, Math.floor(Math.min.apply(null, coins.map(function (c) { return c[0]; }))) - 1);
    var rxb = Math.min(N - 1, Math.ceil(Math.max.apply(null, coins.map(function (c) { return c[0]; }))) + 5);
    var rya = Math.max(0, Math.floor(Math.min.apply(null, coins.map(function (c) { return c[1]; }))) - 1);
    var ryb = Math.min(N - 1, Math.ceil(Math.max.apply(null, coins.map(function (c) { return c[1]; }))) + 5);
    var cx = this.cam.x, cy = this.cam.y, hw = W / 2, hh = H / 2, marge = 70 * z;
    function ecranTuile(rx, ry) { return [((rx - ry) * 32 - cx) * z + hw, ((rx + ry) * 16 - cy) * z + hh]; }
    var calque = this.calque;

    // 1. Sol : terrain et routes.
    var rx, ry, p, x, y, i, xy;
    for (ry = rya; ry <= ryb; ry++) for (rx = rxa; rx <= rxb; rx++) {
      p = ecranTuile(rx, ry);
      if (p[0] < -marge || p[0] > W + marge || p[1] < -40 * z || p[1] > H + 10) continue;
      xy = this.detourner(rx, ry); x = xy[0]; y = xy[1]; i = y * N + x;
      var t = e.terrain[i], s;
      if (t === T.EAU) s = DS.eau((frameEau + x + y) & 3, z);
      else if (t === T.PRAIRIE) s = DS.prairie(e.fertilite[i] < 50 ? 0 : e.fertilite[i] < 80 ? 1 : 2, z);
      else s = DS.herbe((x * 31 + y * 17) & 3, z);
      this.poser(s, p[0], p[1]);
      if (e.route[i]) {
        var m = 0, v;
        v = this.detourner(rx, ry - 1); if (ry > 0 && e.route[v[1] * N + v[0]]) m |= 1;
        v = this.detourner(rx + 1, ry); if (rx < N - 1 && e.route[v[1] * N + v[0]]) m |= 2;
        v = this.detourner(rx, ry + 1); if (ry < N - 1 && e.route[v[1] * N + v[0]]) m |= 4;
        v = this.detourner(rx - 1, ry); if (rx > 0 && e.route[v[1] * N + v[0]]) m |= 8;
        this.poser(DS.route(m, e.route[i] === R.ROME, z), p[0], p[1]);
      }
      if (calque === 'eau') {
        var c = e.eauFontaine[i] ? 'rgba(30,90,200,0.45)' : e.eauPuits[i] ? 'rgba(120,190,255,0.4)' : null;
        if (c) this.poser(DS.losange(c, c, z), p[0], p[1]);
      }
    }

    // 2. Marcheurs rangés par case d'affichage (la plus « avant » des deux cases du pas).
    var bucket = this._bucket;
    bucket.clear();
    var service = calque === 'feu' ? 'prefet' : calque === 'dommages' ? 'ingenieur' : calque === 'eau' ? '-' : null;
    for (var k = 0; k < e.marcheurs.length; k++) {
      var w = e.marcheurs[k];
      if (w.fin) continue;
      if (service && w.type !== service) continue;
      var a = this.tourner(w.x, w.y), b = this.tourner(w.nx, w.ny);
      var cle = (a[0] + a[1] >= b[0] + b[1]) ? a[1] * N + a[0] : b[1] * N + b[0];
      var l = bucket.get(cle);
      if (!l) bucket.set(cle, (l = []));
      l.push(w);
    }

    // 3. Objets par diagonales (ordre de profondeur).
    var aqueducPlein = e.batiments.some(function (bb) { return bb.type === 'reservoir' && bb.plein; });
    var icones = [];
    for (var d = rxa + rya; d <= rxb + ryb; d++) {
      var r0 = Math.max(rxa, d - ryb), r1 = Math.min(rxb, d - rya);
      for (rx = r0; rx <= r1; rx++) {
        ry = d - rx;
        p = ecranTuile(rx, ry);
        if (p[0] < -marge * 2 || p[0] > W + marge * 2 || p[1] < -10 || p[1] > H + 140 * z) continue;
        xy = this.detourner(rx, ry); x = xy[0]; y = xy[1]; i = y * N + x;
        var id = e.bat[i];
        if (id) {
          var bt = SIM.batiment(e, id);
          if (bt) {
            // Le bâtiment est dessiné sur sa case la plus « avant » de l'affichage.
            var c1 = this.tourner(bt.x, bt.y), c2 = this.tourner(bt.x + bt.t - 1, bt.y + bt.t - 1);
            var fx = Math.max(c1[0], c2[0]), fy = Math.max(c1[1], c2[1]);
            if (rx === fx && ry === fy) {
              var hx = Math.min(c1[0], c2[0]), hy = Math.min(c1[1], c2[1]);
              var ph = ecranTuile(hx, hy);
              this.dessinerBatiment(bt, ph[0], ph[1], frame, frame2, calque);
              if (!this.sansInterface && !calque) {
                var cause = SIM.cause(e, bt);
                if (cause) icones.push([cause, ph[0], ph[1] - (bt.t * 8 + 40) * z]);
              }
            }
          }
        } else if (!calque) {
          var tt = e.terrain[i];
          if (tt === T.ARBRES) this.poser(DS.arbre((x * 7 + y * 3) % 3, z), p[0], p[1]);
          else if (tt === T.ROCHERS) this.poser(DS.rocher((x + y) % 3, z), p[0], p[1]);
        }
        if (e.aqueduc[i] && !calque) {
          var va = this.detourner(rx + 1, ry), vb = this.detourner(rx - 1, ry);
          var lie = function (q) { return q[0] >= 0 && q[1] >= 0 && q[0] < N && q[1] < N && (e.aqueduc[q[1] * N + q[0]] || (e.bat[q[1] * N + q[0]] && SIM.batiment(e, e.bat[q[1] * N + q[0]]).type === 'reservoir')); };
          var axe = (lie(va) || lie(vb)) ? 'u' : 'v';
          this.poser(DS.batiment('aqueduc', 1, { axe: axe, eau: aqueducPlein ? 1 : 0, cle: axe + (aqueducPlein ? 1 : 0) }, z), p[0], p[1]);
        }
        if (e.route[i] === R.BARRIERE && !calque) this.poser(DS.batiment('barriere', 1, { cle: '' }, z), p[0], p[1]);
        var lw = bucket.get(ry * N + rx);
        if (lw) for (var j = 0; j < lw.length; j++) this.dessinerMarcheur(lw[j], alpha);
      }
    }

    // 4. Aperçu de pose, sélection, icônes d'arrêt.
    if (this.apercu && this.apercu.cases) {
      var ap = this.apercu, tb = SIM.donnees().batiments[ap.type], taille = tb ? tb.taille : 1;
      ap.cases.forEach(function (cs) {
        for (var yy = 0; yy < (ap.zone ? 1 : taille); yy++) for (var xx = 0; xx < (ap.zone ? 1 : taille); xx++) {
          var q = self.tourner(cs.x + xx, cs.y + yy), pp = ecranTuile(q[0], q[1]);
          self.poser(DS.losange(cs.ok ? 'ok' : 'non', cs.ok ? 'rgba(70,200,90,0.5)' : 'rgba(220,60,50,0.5)', z), pp[0], pp[1]);
        }
      });
    }
    if (this.selection) {
      var sb = SIM.batiment(e, this.selection);
      if (sb) {
        var q1 = this.tourner(sb.x, sb.y), q2 = this.tourner(sb.x + sb.t - 1, sb.y + sb.t - 1);
        var mx = Math.min(q1[0], q2[0]), my = Math.min(q1[1], q2[1]), t2 = sb.t;
        var pa = ecranTuile(mx, my), pb = ecranTuile(mx + t2, my), pc = ecranTuile(mx + t2, my + t2), pd = ecranTuile(mx, my + t2);
        ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.lineTo(pc[0], pc[1]); ctx.lineTo(pd[0], pd[1]); ctx.closePath(); ctx.stroke();
      }
    }
    var bob = Math.sin(temps / 300) * 2 * z;
    for (var n = 0; n < icones.length; n++) this.poser(DS.icone(icones[n][0], z), icones[n][1], icones[n][2] + bob);
    if (this.effetAffiche) {
      // Affiche : soleil chaud venu du nord-ouest, bas assombri pour le bandeau du titre.
      var g = ctx.createRadialGradient(W * 0.15, H * 0.05, 0, W * 0.15, H * 0.05, Math.max(W, H) * 0.9);
      g.addColorStop(0, 'rgba(255,214,140,0.42)'); g.addColorStop(0.55, 'rgba(255,190,120,0.12)'); g.addColorStop(1, 'rgba(255,170,110,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var b = ctx.createLinearGradient(0, H * 0.7, 0, H);
      b.addColorStop(0, 'rgba(40,24,10,0)'); b.addColorStop(1, 'rgba(40,24,10,0.35)');
      ctx.fillStyle = b; ctx.fillRect(0, H * 0.7, W, H * 0.3);
    }
  };

  Rendu.prototype.dessinerBatiment = function (b, sx, sy, frame, frame2, calque) {
    var e = this.e, z = this.cam.z, d = SIM.donnees().batiments[b.type], s;
    if (calque) {
      // Calque : bâtiment aplati, colonne de couverture.
      var coul = COULEUR_CAT[d.categorie] || '#9a9184';
      for (var yy = 0; yy < b.t; yy++) for (var xx = 0; xx < b.t; xx++) {
        var q = this.tourner(b.x + xx, b.y + yy), m = this.e;
        var p = [((q[0] - q[1]) * 32 - this.cam.x) * z + this.W / 2, ((q[0] + q[1]) * 16 - this.cam.y) * z + this.H / 2];
        this.poser(DS.losange('c' + coul, coul, z), p[0], p[1]);
        void m;
      }
      var centre = [sx, sy + b.t * 16 * z];
      var v = null, coulCol = null;
      if (calque === 'feu' && d.genre !== 'ruines' && d.genre !== 'incendie' && (b.type !== 'logement' || b.hab > 0)) { v = b.feu / 100; coulCol = couleurRisque(v); }
      else if (calque === 'dommages' && d.genre !== 'ruines' && d.genre !== 'incendie' && (b.type !== 'logement' || b.hab > 0)) { v = b.dom / 100; coulCol = couleurRisque(v); }
      else if (calque === 'eau' && b.type === 'logement' && b.hab > 0) {
        var i = b.y * e.N + b.x, niveau = e.eauFontaine[i] ? 2 : e.eauPuits[i] ? 1 : 0;
        v = niveau * 50; coulCol = niveau === 2 ? '#2b6fd6' : niveau === 1 ? '#7ec0ff' : '#c94a3a';
      }
      if (b.type === 'incendie') this.poser(DS.incendie(b.t, frame, z), sx, sy);
      if (v !== null) this.colonne(centre[0], centre[1], 6 + v * 0.5, coulCol);
      return;
    }
    var v2 = (b.x * 7 + b.y * 13) % 3;
    switch (b.type) {
      case 'logement': s = DS.maison(b.hab > 0 ? b.niv : 0, v2, b.t, z); break;
      case 'incendie': s = DS.incendie(b.t, frame, z); break;
      case 'fontaine': s = DS.batiment('fontaine', 1, { actif: b.actif, frame: frame2, cle: '' + b.actif + frame2 }, z); break;
      case 'reservoir': s = DS.batiment('reservoir', 3, { plein: b.plein, frame: frame2, cle: '' + b.plein + frame2 }, z); break;
      case 'ferme_ble': { var pr = Math.round(b.prog / 2500) / 4; s = DS.batiment('ferme_ble', 3, { prog: pr, cle: '' + pr }, z); break; }
      case 'marche': { var st = SIM.totalStock(b) > 0 ? 1 : 0; s = DS.batiment('marche', 2, { stock: st, cle: '' + st }, z); break; }
      default: s = DS.batiment(b.type, b.t, { cle: '' }, z);
    }
    this.poser(s, sx, sy);
  };

  Rendu.prototype.dessinerMarcheur = function (w, alpha) {
    var f = w.attente > 0 ? 0 : Math.min(1, (w.prog + alpha) / w.v);
    var fx = w.x + (w.nx - w.x) * f + 0.5, fy = w.y + (w.ny - w.y) * f + 0.5;
    var m = this.monde(fx, fy), p = this.ecran(m[0], m[1]);
    var a = this.monde(w.x + 0.5, w.y + 0.5), b = this.monde(w.nx + 0.5, w.ny + 0.5);
    var gauche = b[0] < a[0];
    var pose = Math.floor(f * 4) % 2;
    // Petit décalage par marcheur : deux marcheurs sur la même case ne se superposent pas.
    var dec = ((w.id * 7) % 9 - 4) * this.cam.z;
    this.poser(DS.marcheur(w.type, pose, gauche, this.cam.z), p[0] + dec, p[1] + dec * 0.3);
  };

  // --- Mini-carte -------------------------------------------------------------
  // Une case = un pixel d'une petite image, posée en losange par une transformation affine.
  Rendu.prototype.dessinerMiniCarte = function (canvas) {
    var e = this.e;
    if (!e) return;
    var N = e.N, T = SIM.T;
    if (!this._miniImg || this._miniImg.width !== N) { this._miniImg = document.createElement('canvas'); this._miniImg.width = N; this._miniImg.height = N; }
    var ic = this._miniImg.getContext('2d'), img = ic.createImageData(N, N), d = img.data;
    var COUL = { 0: [122, 162, 70], 1: [170, 180, 80], 2: [60, 100, 45], 3: [140, 135, 125], 4: [63, 127, 181] };
    for (var i = 0; i < N * N; i++) {
      var c = COUL[e.terrain[i]] || COUL[0];
      if (e.route[i]) c = [205, 196, 170];
      if (e.bat[i]) {
        var b = SIM.batiment(e, e.bat[i]);
        c = !b ? c : b.type === 'logement' ? [196, 120, 80] : b.type === 'incendie' ? [240, 120, 40] : (b.type === 'ruines' || b.type === 'gravats') ? [80, 70, 60] : [235, 225, 205];
      }
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    ic.putImageData(img, 0, 0);
    var ctx = canvas.getContext('2d'), Wm = canvas.width, Hm = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, Wm, Hm);
    var k = Math.min(Wm / (2 * N), Hm / N) * 0.98;
    this._miniK = k;
    // Monde (pixels au zoom 1) → mini-carte : diviser par 32, multiplier par k.
    var self = this, o = this.monde(0, 0), ux = this.monde(1, 0), uy = this.monde(0, 1);
    var s = k / 32;
    var ox = Wm / 2, oy = (Hm - N * k) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform((ux[0] - o[0]) * s, (ux[1] - o[1]) * s, (uy[0] - o[0]) * s, (uy[1] - o[1]) * s, ox + o[0] * s, oy + o[1] * s);
    ctx.drawImage(this._miniImg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._miniO = [ox, oy, s];
    // Rectangle de la vue.
    var z = this.cam.z, coins = [[0, 0], [this.W, 0], [this.W, this.H], [0, this.H]].map(function (p) {
      var wx = (p[0] - self.W / 2) / z + self.cam.x, wy = (p[1] - self.H / 2) / z + self.cam.y;
      return [ox + wx * s, oy + wy * s];
    });
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); coins.forEach(function (c, n) { if (n) ctx.lineTo(c[0], c[1]); else ctx.moveTo(c[0], c[1]); }); ctx.closePath(); ctx.stroke();
  };
  // Clic sur la mini-carte : centre la vue sur ce point.
  Rendu.prototype.miniVersMonde = function (mx, my) {
    if (!this._miniO) return;
    var o = this._miniO;
    this.cam.x = (mx - o[0]) / o[2]; this.cam.y = (my - o[1]) / o[2];
    this.limiter();
  };

  racine.MM_RENDU = {
    ZOOMS: ZOOMS,
    creer: function (canvas) {
      DS = racine.MM_DESSINS; SIM = racine.MM_SIM;
      return new Rendu(canvas);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
