// Diofior Connect · plateforme de résultats
// Lit uniquement des résultats agrégés via les fonctions publiques Supabase
// (supabase/12_resultats_publics.sql dans le dépôt de l'application).
// La clé "publishable" est publique par conception : la protection repose sur les règles RLS.
const SUPABASE_URL = 'https://hpfddkctmhlscfcrexnt.supabase.co';
const SUPABASE_CLE = 'sb_publishable_iXhieJhE1ddxuAN0q_8N-Q_vU7NKu4y';

const QUALITES = ['Excellent', 'Bon', 'Moyen', 'Faible', 'Aucun réseau'];
const COUL_Q = ['#1B9E4B', '#8BC34A', '#FB8C00', '#E53935', '#6D1B1B'];
const COUL_OP = { Orange: '#FF7900', Yas: '#1E3A8A', Expresso: '#E0B000' };
const OPERATEURS = ['Orange', 'Yas', 'Expresso'];
const CENTRE = [14.1905, -16.6640];

// Période affichée : '' = toutes les données, 'memoire' = jusqu'à la fin de la période du mémoire
let periode = '', finMemoire = null, enSecours = false;
const cache = {};
// Nom du fichier de secours (copie quotidienne faite par .github/workflows/instantane.yml)
const nomSecours = (nom, p) => `secours/${nom}_${['p_operateur', 'p_reseau', 'p_jusqu_au'].map(k => p[k] || 'x').join('_')}.json`;
async function rpc(nom, params = {}) {
  const p = { ...params };
  if (periode === 'memoire' && finMemoire && nom !== 'resultats_info') p.p_jusqu_au = finMemoire;
  const cle = nom + JSON.stringify(p);
  if (!cache[cle]) {
    cache[cle] = fetch(`${SUPABASE_URL}/rest/v1/rpc/${nom}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_CLE, 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }).then(r => { if (!r.ok) throw new Error(`${nom} : HTTP ${r.status}`); return r.json(); })
      .catch(async e => {
        // Base indisponible (ex. projet en pause) : on se rabat sur la dernière copie du site
        const r = await fetch(nomSecours(nom, p)).catch(() => null);
        if (!r || !r.ok) { delete cache[cle]; throw e; }
        signalerSecours(); return r.json();
      });
  }
  return cache[cle];
}
function signalerSecours() {
  if (enSecours) return; enSecours = true;
  fetch('secours/genere_le.json').then(r => r.json()).then(g => {
    $('bandeau').textContent = `Base momentanément indisponible · copie des résultats du ${new Date(g.genere_le).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}`;
  }).catch(() => { $('bandeau').textContent = 'Base momentanément indisponible · copie de secours des résultats'; });
  $('bandeau').classList.add('secours');
}

const $ = id => document.getElementById(id);
const fmt = n => n == null ? '–' : n.toLocaleString('fr-FR');
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

// ---------- Onglets ----------
const prets = {};
function ouvrir(onglet) {
  document.querySelectorAll('.onglets button').forEach(b => b.classList.toggle('actif', b.dataset.onglet === onglet));
  document.querySelectorAll('.panneau').forEach(p => p.classList.toggle('actif', p.id === 'p-' + onglet));
  try { history.replaceState(null, '', '#' + onglet); } catch (_) {}
  if (!prets[onglet]) { prets[onglet] = true; ({ carte: initCarte, operateurs: initOperateurs, zones: initZones, participation: initParticipation })[onglet]?.(); }
  setTimeout(() => { carte1?.invalidateSize(); carte2?.invalidateSize(); }, 50);
}
$('onglets').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ouvrir(b.dataset.onglet); });

function groupe(id, surChoix) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('actif', x === b));
    surChoix(b.dataset.v);
  });
}
function erreur(el, e) { el.textContent = 'Impossible de charger les résultats pour le moment. Vérifie ta connexion puis recharge la page.'; console.error(e); }

// ---------- Fond de carte ----------
let commune = null;
const communeP = fetch('commune.geojson').then(r => r.json()).then(g => (commune = g));
function nouvelleCarte(id) {
  const m = L.map(id, { zoomControl: true, attributionControl: true }).setView(CENTRE, 14);
  m.createPane('noms'); m.getPane('noms').style.zIndex = 350; m.getPane('noms').style.pointerEvents = 'none';
  const plan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(m);
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
  });
  const noms = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, maxNativeZoom: 18, pane: 'noms',
  });
  const satNoms = L.layerGroup([satellite, noms]);
  L.control.layers({ 'Plan': plan, 'Satellite': satNoms }, null, { position: 'topright', collapsed: window.innerWidth < 600 }).addTo(m);
  communeP.then(g => {
    const c = L.geoJSON(g, { filter: f => f.geometry.type !== 'Point', style: { color: '#0F4A23', weight: 2.5, dashArray: '6 5', fill: false }, interactive: false }).addTo(m);
    m.fitBounds(c.getBounds(), { padding: [10, 10] });
  });
  return m;
}
let senegal = null;
const senegalP = fetch('senegal.geojson').then(r => r.json()).then(g => (senegal = g));
let coucheSenegal;
function afficherSenegal(m, oui) {
  coucheSenegal?.remove(); coucheSenegal = null;
  if (oui) senegalP.then(g => {
    coucheSenegal = L.geoJSON(g, { style: { color: '#7B1FA2', weight: 2.5, dashArray: '10 6', fill: false }, interactive: false })
      .bindTooltip('Frontière du Sénégal', { sticky: true }).addTo(m);
  });
}
function hexFeature(h) { return { type: 'Feature', geometry: h.geojson, properties: h }; }

// ---------- 1. Carte de qualité ----------
let carte1, couche1, filtre = { op: '', reseau: '', etendue: '' };
function legendeQualite() {
  $('legende1').innerHTML = QUALITES.map((q, i) => `<span><i class="pastille q${i}"></i>${q}</span>`).join('') +
    '<span><i class="pastille qn"></i>Pas assez de mesures</span>';
}
async function majCarte1() {
  $('charg1').classList.add('visible');
  try {
    const p = {}; if (filtre.op) p.p_operateur = filtre.op; if (filtre.reseau) p.p_reseau = filtre.reseau;
    afficherSenegal(carte1, filtre.etendue === 'tout');
    $('hz-bloc').hidden = filtre.etendue !== 'tout';
    if (filtre.etendue === 'tout') { await majAuDela(p); $('charg1').classList.remove('visible'); return; }
    const hex = await rpc('resultats_grille', p);
    couche1?.remove();
    const vus = hex.filter(h => h.nb > 0);
    couche1 = L.geoJSON({ type: 'FeatureCollection', features: vus.map(hexFeature) }, {
      style: f => {
        const q = f.properties.qualite;
        return q == null
          ? { color: '#8a908a', weight: 1, fillColor: '#B9BFB8', fillOpacity: .45 }
          : { color: '#fff', weight: 1.2, fillColor: COUL_Q[q], fillOpacity: .68 };
      },
      onEachFeature: (f, l) => l.bindPopup(popupHex(f.properties)),
    }).addTo(carte1);
    const classes = vus.filter(h => h.qualite != null);
    const bons = classes.filter(h => h.qualite <= 1).length;
    const faibles = classes.filter(h => h.qualite >= 3).length;
    const quoi = [filtre.op || 'tous opérateurs', filtre.reseau || 'tous réseaux'].join(', ');
    $('resume1').textContent = classes.length
      ? `${quoi} : ${classes.length} zones évaluées — ${pct(bons, classes.length)} % avec un signal bon ou excellent, ${pct(faibles, classes.length)} % faible ou sans réseau. Touchez un hexagone pour le détail.`
      : `${quoi} : pas encore assez de mesures pour colorer la carte.`;
  } catch (e) { erreur($('resume1'), e); }
  $('charg1').classList.remove('visible');
}
// Carte "au-delà de Diofior" : toutes les mesures, hexagones de 500 m, au moins 5 mesures
async function majAuDela(p) {
  const hex = await rpc('resultats_hors_zone', p);
  couche1?.remove();
  couche1 = L.geoJSON({ type: 'FeatureCollection', features: hex.map(hexFeature) }, {
    style: f => { const q = f.properties.qualite; return q == null
      ? { color: '#8a908a', weight: 1, fillColor: '#B9BFB8', fillOpacity: .45 }
      : { color: '#fff', weight: 1, fillColor: COUL_Q[q], fillOpacity: f.properties.dans_commune ? .45 : .7 }; },
    onEachFeature: (f, l) => l.bindPopup(popupHex(f.properties) + (f.properties.dans_commune ? '' : '<br><i>Hors de la zone d\'étude</i>')),
  }).addTo(carte1);
  if (hex.length) carte1.fitBounds(couche1.getBounds(), { padding: [20, 20], maxZoom: 14 });
  const hors = hex.filter(h => !h.dans_commune).length;
  $('resume1').textContent = `Toutes les mesures, y compris celles faites pendant les trajets hors de la commune : ${hors} zone${hors > 1 ? 's' : ''} hors de Diofior. ` +
    'Hors de la commune, une zone n\'apparaît que si au moins 2 téléphones différents y sont passés, pour ne jamais montrer le trajet d\'une seule personne. ' +
    'Ces données ne font pas partie de l\'analyse du mémoire (perspectives) ; la zone d\'étude est la commune de Diofior (tirets verts), la frontière du Sénégal est en violet. Pour protéger la vie privée, les hexagones font ici 500 m de côté et comptent au moins 5 mesures.';
  // tableau résumé hors commune
  rpc('resultats_hors_zone_resume').then(rows => {
    const T = ['4G', '3G', '2G', 'aucun'];
    $('t-hz').innerHTML = `<thead><tr><th>Opérateur</th>${T.map(t => `<th class="num">${t === 'aucun' ? 'Aucun réseau' : t}</th>`).join('')}<th class="num">Mesures</th></tr></thead><tbody>` +
      OPERATEURS.map(op => { const r = rows.filter(x => x.operateur === op); const n = r.reduce((s, x) => s + x.nb, 0);
        return `<tr><td><i class="op" style="background:${COUL_OP[op]}"></i>${op}</td>${T.map(t => { const x = r.find(y => y.reseau === t); return `<td class="num">${n && x ? pct(x.nb, n) + ' %' : '–'}</td>`; }).join('')}<td class="num">${fmt(n)}</td></tr>`; }).join('') + '</tbody>';
  }).catch(e => console.error(e));
}
function popupHex(h) {
  let s = `<b>${h.qualite == null ? 'Pas assez de mesures' : QUALITES[h.qualite]}</b><br>${fmt(h.nb)} mesure${h.nb > 1 ? 's' : ''}`;
  if (h.signal_median != null) s += `<br>Signal médian : ${h.signal_median} dBm`;
  if (h.part_3g != null) s += `<br>4G ${Math.round(h.part_4g * 100)} % · 3G ${Math.round(h.part_3g * 100)} % · 2G ${Math.round(h.part_2g * 100)} %` + (h.part_aucun ? ` · aucun réseau ${Math.round(h.part_aucun * 100)} %` : '');
  else if (h.part_4g != null) s += `<br>Part de 4G : ${Math.round(h.part_4g * 100)} %`;
  if (h.debit_median != null) s += `<br>Débit médian : ${h.debit_median} Mb/s`;
  return s;
}
function initCarte() {
  carte1 = nouvelleCarte('map1'); legendeQualite();
  groupe('f-operateur', v => { filtre.op = v; majCarte1(); });
  groupe('f-reseau', v => { filtre.reseau = v; majCarte1(); });
  groupe('f-etendue', v => {
    filtre.etendue = v; majCarte1();
    if (!v && commune) carte1.fitBounds(L.geoJSON(commune, { filter: f => f.geometry.type !== 'Point' }).getBounds(), { padding: [10, 10] });
  });
  majCarte1();
}

// ---------- 2. Opérateurs ----------
const graphes = {};
function graphe(id, config) { graphes[id]?.destroy(); graphes[id] = new Chart($(id), config); }
Chart.defaults.font.family = "'Poppins', system-ui, sans-serif";
Chart.defaults.color = '#5E6660';
Chart.defaults.locale = 'fr-FR';
async function initOperateurs() {
  try {
    const [rows, debit] = await Promise.all([rpc('resultats_operateurs'), rpc('resultats_debit')]);
    const parOp = OPERATEURS.map(op => {
      const r = rows.filter(x => x.operateur === op);
      const t = k => r.reduce((s, x) => s + (x[k] || 0), 0);
      const c = [t('excellent'), t('bon'), t('moyen'), t('faible'), t('aucun')];
      return { op, r, c, classe: c.reduce((a, b) => a + b, 0), nb: t('nb') };
    });
    // phrase de synthèse
    $('lead-op').textContent = parOp.filter(o => o.classe).map(o =>
      `${o.op} : ${pct(o.c[0] + o.c[1], o.classe)} % de mesures bonnes ou excellentes`).join(' · ') + '.';
    // graphique qualité (100 % empilé)
    graphe('g-qualite', {
      type: 'bar',
      data: { labels: parOp.map(o => o.op), datasets: QUALITES.map((q, i) => ({
        label: q, backgroundColor: COUL_Q[i], data: parOp.map(o => o.classe ? 100 * o.c[i] / o.classe : 0),
        brut: parOp.map(o => o.c[i]) })) },
      options: optionsEmpile('% des mesures évaluées'),
    });
    // graphique techno
    const TECH = ['4G', '3G', '2G', 'aucun'], COUL_T = ['#0F4A23', '#4C9A62', '#A7D3B2', '#C8CCC6'];
    graphe('g-techno', {
      type: 'bar',
      data: { labels: parOp.map(o => o.op), datasets: TECH.map((t, i) => ({
        label: t === 'aucun' ? 'Aucun réseau' : t, backgroundColor: COUL_T[i],
        data: parOp.map(o => { const n = o.r.find(x => x.reseau === t)?.nb || 0; return o.nb ? 100 * n / o.nb : 0; }),
        brut: parOp.map(o => o.r.find(x => x.reseau === t)?.nb || 0) })) },
      options: optionsEmpile('% des mesures'),
    });
    // tableau signal
    const res = ['4G', '3G', '2G'];
    $('t-signal').innerHTML = `<thead><tr><th>Opérateur</th>${res.map(r => `<th class="num">${r}</th>`).join('')}<th class="num">Mesures</th></tr></thead><tbody>` +
      parOp.map(o => `<tr><td><i class="op" style="background:${COUL_OP[o.op]}"></i>${o.op}</td>${res.map(r => {
        const x = o.r.find(y => y.reseau === r);
        return `<td class="num">${x && x.signal_median != null ? x.signal_median + ' dBm' : '–'}${x ? ` <small style="color:#5E6660">(${fmt(x.nb)})</small>` : ''}</td>`;
      }).join('')}<td class="num">${fmt(o.nb)}</td></tr>`).join('') + '</tbody>';
    // tableau débit
    $('t-debit').innerHTML = debit.length
      ? `<thead><tr><th>Opérateur</th><th class="num">Réception</th><th class="num">Envoi</th><th class="num">Latence</th><th class="num">Tests</th></tr></thead><tbody>` +
        debit.map(d => `<tr><td><i class="op" style="background:${COUL_OP[d.operateur]}"></i>${d.operateur}</td><td class="num">${d.down_median} Mb/s</td><td class="num">${d.up_median} Mb/s</td><td class="num">${d.latence_median} ms</td><td class="num">${d.nb}</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td>Pas encore de test de débit.</td></tr></tbody>';
  } catch (e) { erreur($('lead-op'), e); }
}
function optionsEmpile(titre) {
  return {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + ' %' }, title: { display: true, text: titre } },
              y: { stacked: true, grid: { display: false }, ticks: { font: { weight: 600, size: 13 } } } },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12 } },
               tooltip: { callbacks: { label: c => `${c.dataset.label} : ${Math.round(c.raw)} % (${fmt(c.dataset.brut[c.dataIndex])})` } } },
  };
}

// ---------- 3. Zones ----------
let carte2, couche2, modeZones = 'avancement';
async function majZones(mode = modeZones) {
  modeZones = mode;
  $('charg2').classList.add('visible');
  try {
    const hex = await rpc('resultats_grille', {});
    couche2?.remove();
    let style, leg, resume;
    if (mode === 'avancement') {
      const etat = h => h.nb >= 3 ? 2 : h.nb > 0 ? 1 : 0;
      const C = ['#E53935', '#FB8C00', '#1B9E4B'];
      style = f => { const e = etat(f.properties); return { color: C[e], weight: e ? 1 : 1.6, dashArray: e ? null : '4 4', fillColor: C[e], fillOpacity: e === 2 ? .45 : e === 1 ? .35 : .08 }; };
      const n = [0, 0, 0]; hex.forEach(h => n[etat(h)]++);
      leg = `<span><i class="pastille" style="background:#1B9E4B"></i>Bien mesuré (3 mesures ou plus)</span><span><i class="pastille" style="background:#FB8C00"></i>Peu mesuré</span><span><i class="pastille" style="background:#fff;border:2px dashed #E53935"></i>Pas encore visité</span>`;
      resume = `${pct(n[2], hex.length)} % de la commune est bien mesurée (${n[2]} zones sur ${hex.length}). ${n[0]} zones n'ont encore aucune mesure : ce sont les quartiers à parcourir en priorité.`;
    } else {
      style = f => { const q = f.properties.qualite; return q != null && q >= 2
        ? { color: '#fff', weight: 1.2, fillColor: COUL_Q[q], fillOpacity: .7 }
        : { color: '#9aa09a', weight: .8, fillColor: '#ffffff', fillOpacity: q == null ? 0 : .25 }; };
      const ev = hex.filter(h => h.qualite != null), f = ev.filter(h => h.qualite >= 3);
      leg = `<span><i class="pastille q2"></i>Moyen</span><span><i class="pastille q3"></i>Faible</span><span><i class="pastille q4"></i>Aucun réseau</span>`;
      resume = ev.length ? `Tous opérateurs confondus, ${f.length} zones sur ${ev.length} évaluées ont un signal faible ou pas de réseau.` : 'Pas encore assez de mesures.';
    }
    couche2 = L.geoJSON({ type: 'FeatureCollection', features: hex.map(hexFeature) }, {
      style, onEachFeature: (f, l) => l.bindPopup(popupHex(f.properties)) }).addTo(carte2);
    $('legende2').innerHTML = leg; $('resume2').textContent = resume;
  } catch (e) { erreur($('resume2'), e); }
  $('charg2').classList.remove('visible');
}
function initZones() { carte2 = nouvelleCarte('map2'); groupe('f-zones', majZones); majZones('avancement'); }

// ---------- 4. Participation ----------
async function initParticipation() {
  try {
    const [jours, hex] = await Promise.all([rpc('resultats_participation'), rpc('resultats_grille', {})]);
    const total = jours.reduce((s, j) => s + j.nb_mesures, 0);
    const tel = jours[0]?.total_participants || 0;
    const couv = pct(hex.filter(h => h.nb >= 3).length, hex.length);
    $('tuiles').innerHTML = [[fmt(total), 'mesures retenues'], [fmt(tel), 'téléphones participants'], [jours.length, 'jours de collecte'], [couv + ' %', 'de la commune bien mesurée']]
      .map(([v, l]) => `<div class="tuile"><b>${v}</b><span>${l}</span></div>`).join('');
    const lab = jours.map(j => new Date(j.jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));
    graphe('g-jours', {
      data: { labels: lab, datasets: [
        { type: 'bar', label: 'Mesures', data: jours.map(j => j.nb_mesures), backgroundColor: '#1E7B3A', borderRadius: 6, yAxisID: 'y' },
        { type: 'line', label: 'Téléphones actifs', data: jours.map(j => j.nb_participants), borderColor: '#F2A900', backgroundColor: '#F2A900', yAxisID: 'y2', tension: .3 } ] },
      options: { responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Mesures' } },
                  y2: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { precision: 0 }, title: { display: true, text: 'Téléphones' } },
                  x: { grid: { display: false } } },
        plugins: { legend: { position: 'bottom' } } },
    });
  } catch (e) { erreur($('tuiles'), e); }
}

// ---------- Téléchargements (résultats agrégés uniquement) ----------
function telecharger(nom, contenu, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenu], { type }));
  a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// Séparateur « ; » et virgule décimale : s'ouvre directement dans Excel en français
const cellule = v => v == null ? '' : /^-?\d+\.\d+$/.test(String(v)) ? String(v).replace('.', ',') : String(v);
const versCsv = (lignes, cols) => '\ufeff' + [cols.join(';'), ...lignes.map(l => cols.map(c => cellule(l[c])).join(';'))].join('\n');
document.querySelector('.telechargements').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const suffixe = periode === 'memoire' && finMemoire ? `_jusquau_${finMemoire}` : `_${new Date().toISOString().slice(0, 10)}`;
  $('dl-note').textContent = 'Préparation…';
  try {
    const k = b.dataset.dl;
    if (k.startsWith('grille')) {
      const hex = await rpc('resultats_grille', {});
      const props = h => ({ nb_mesures: h.nb, qualite: h.qualite == null ? '' : QUALITES[h.qualite], part_4g: h.part_4g, debit_median_mbps: h.debit_median, nb_operateurs: h.nb_operateurs });
      if (k === 'grille-geojson') {
        telecharger(`diofior_connect_grille${suffixe}.geojson`, JSON.stringify({ type: 'FeatureCollection',
          features: hex.map(h => ({ type: 'Feature', geometry: h.geojson, properties: props(h) })) }), 'application/geo+json');
      } else {
        const lignes = hex.map(h => { const c = h.geojson.coordinates[0].slice(0, -1); return { ...props(h),
          longitude: (c.reduce((s, p) => s + p[0], 0) / c.length).toFixed(6), latitude: (c.reduce((s, p) => s + p[1], 0) / c.length).toFixed(6) }; });
        telecharger(`diofior_connect_grille${suffixe}.csv`, versCsv(lignes, ['longitude', 'latitude', 'nb_mesures', 'qualite', 'part_4g', 'debit_median_mbps', 'nb_operateurs']), 'text/csv');
      }
    } else if (k === 'operateurs-csv') {
      const rows = await rpc('resultats_operateurs');
      telecharger(`diofior_connect_operateurs${suffixe}.csv`, versCsv(rows, ['operateur', 'reseau', 'nb', 'signal_median', 'excellent', 'bon', 'moyen', 'faible', 'aucun']), 'text/csv');
    } else {
      const rows = await rpc('resultats_participation');
      telecharger(`diofior_connect_participation${suffixe}.csv`, versCsv(rows, ['jour', 'nb_mesures', 'nb_participants']), 'text/csv');
    }
    $('dl-note').textContent = 'Fichier téléchargé.';
  } catch (err) { erreur($('dl-note'), err); }
});

// ---------- Démarrage ----------
document.querySelectorAll('.carte-graph canvas').forEach(c => { c.parentElement.style.height = (+c.getAttribute('height') + 28) + 'px'; });
const dateFr = (d, o = { day: 'numeric', month: 'long' }) => new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR', o);
$('maj').textContent = 'données consultées le ' + new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const infoP = rpc('resultats_info').then(([i]) => {
  if (!i) return;
  finMemoire = i.fin_periode_memoire;
  if (finMemoire) $('b-memoire').textContent = `Période du mémoire (${dateFr(i.debut_collecte, { day: 'numeric' })}–${dateFr(finMemoire, { day: 'numeric', month: 'short' })})`;
  if (i.derniere_mesure && !enSecours) {
    const d = new Date(i.derniere_mesure);
    $('bandeau').textContent = `Collecte en cours · dernière mesure reçue le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  majNotePeriode();
}).catch(e => console.error(e));
function majNotePeriode() {
  $('periode-note').textContent = periode === 'memoire' && finMemoire
    ? (new Date() > new Date(finMemoire + 'T23:59:59')
        ? `Données arrêtées au ${dateFr(finMemoire)} : ce sont les chiffres analysés dans le mémoire.`
        : `Période du mémoire en cours, jusqu'au ${dateFr(finMemoire)} inclus.`)
    : 'Toutes les mesures reçues, mises à jour en direct.';
}
groupe('f-periode', v => {
  periode = v; majNotePeriode();
  if (prets.carte) majCarte1();
  if (prets.zones) majZones();
  if (prets.operateurs) initOperateurs();
  if (prets.participation) initParticipation();
});
const ONGLETS = ['carte', 'operateurs', 'zones', 'participation', 'methode'];
const depuisAdresse = () => { const h = location.hash.slice(1); ouvrir(ONGLETS.includes(h) ? h : 'carte'); };
window.addEventListener('hashchange', depuisAdresse);
depuisAdresse();
