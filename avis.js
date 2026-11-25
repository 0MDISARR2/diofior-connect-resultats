// Onglet « Votre avis » : questionnaire SUS anonyme, envoyé à la table avis_participants
// (insertion seule pour le public ; la lecture est réservée à l'auteur).
const AVIS_URL = 'https://hpfddkctmhlscfcrexnt.supabase.co';
const AVIS_CLE = 'sb_publishable_iXhieJhE1ddxuAN0q_8N-Q_vU7NKu4y';
const SUS = [
  "Je pense que j'aimerais utiliser cette application fréquemment.",
  "J'ai trouvé l'application inutilement complexe.",
  "J'ai trouvé l'application facile à utiliser.",
  "Je pense que j'aurais besoin de l'aide d'une personne compétente pour utiliser cette application.",
  "J'ai trouvé que les différentes fonctions de l'application étaient bien conçues.",
  "J'ai trouvé qu'il y avait trop d'incohérences dans l'application.",
  "J'imagine que la plupart des gens apprendraient très rapidement à utiliser cette application.",
  "J'ai trouvé l'application très contraignante à utiliser.",
  "Je me suis senti(e) en confiance en utilisant l'application.",
  "J'ai dû apprendre beaucoup de choses avant de pouvoir utiliser cette application.",
];
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

function initAvis() {
  const zone = document.getElementById('sus');
  zone.innerHTML = SUS.map((q, i) => `
    <fieldset class="sus-q" id="sus-${i + 1}"><legend><b>${i + 1}.</b> ${q}</legend>
      <div class="echelle">${[1, 2, 3, 4, 5].map(v =>
        `<label><input type="radio" name="q${i + 1}" value="${v}"><span>${v}</span></label>`).join('')}</div>
      <div class="bornes"><span>Pas du tout d'accord</span><span>Tout à fait d'accord</span></div>
    </fieldset>`).join('');

  fetch(`${AVIS_URL}/rest/v1/rpc/avis_nombre`, { method: 'POST', headers: { apikey: AVIS_CLE, 'Content-Type': 'application/json' }, body: '{}' })
    .then(r => r.ok ? r.json() : null).then(n => {
      if (n > 0) { const c = document.getElementById('avis-compteur'); c.textContent = `${n} participant${n > 1 ? 's ont' : ' a'} déjà répondu.`; c.hidden = false; }
    }).catch(() => {});

  if (lsGet('avis_envoye')) { document.getElementById('f-avis').hidden = true; document.getElementById('avis-merci').hidden = false; }

  const f = document.getElementById('f-avis');
  f.addEventListener('change', e => { const fs = e.target.closest('.sus-q'); if (fs) fs.classList.remove('manque'); if (!f.querySelector('.manque')) document.getElementById('avis-erreur').hidden = true; });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('avis-erreur'); err.hidden = true;
    if (f.site_web.value) return; // champ piège rempli par un robot
    const d = new FormData(f), corps = {};
    const manquent = [];
    for (let i = 1; i <= 10; i++) {
      const v = d.get('q' + i);
      if (!v) manquent.push(i); else corps['q' + i] = +v;
      document.getElementById('sus-' + i).classList.toggle('manque', !v);
    }
    if (manquent.length) {
      err.textContent = `Merci de répondre à toutes les phrases de la partie 1 (manque : ${manquent.join(', ')}).`;
      err.hidden = false; document.getElementById('sus-' + manquent[0]).scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }
    const txt = k => { const v = (d.get(k) || '').trim(); return v ? v.slice(0, 1500) : null; };
    corps.operateur = d.get('operateur') || null;
    corps.duree = d.get('duree') || null;
    corps.site_consulte = d.get('site') ? d.get('site') === 'oui' : null;
    const s = d.getAll('souhaits'); corps.souhaits = s.length ? s : null;
    corps.difficultes = txt('difficultes'); corps.apprecie = txt('apprecie'); corps.ameliorations = txt('ameliorations');
    let jeton = lsGet('avis_jeton');
    if (!jeton) { jeton = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); lsSet('avis_jeton', jeton); }
    corps.jeton = jeton;
    const b = document.getElementById('avis-envoyer'); b.disabled = true; b.textContent = 'Envoi…';
    try {
      const r = await fetch(`${AVIS_URL}/rest/v1/avis_participants`, {
        method: 'POST', headers: { apikey: AVIS_CLE, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(corps) });
      if (!r.ok && r.status !== 409) throw new Error(r.status);
      lsSet('avis_envoye', '1');
      f.hidden = true; const m = document.getElementById('avis-merci'); m.hidden = false; m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {
      err.textContent = "L'envoi n'a pas abouti. Vérifiez votre connexion Internet puis touchez à nouveau « Envoyer ».";
      err.hidden = false; b.disabled = false; b.textContent = 'Envoyer mon avis';
    }
  });
}
