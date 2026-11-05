"""Copie quotidienne des résultats agrégés (dossier secours/).

Deux rôles :
1. garder la base Supabase active (un projet gratuit inactif est mis en pause) ;
2. fournir une copie de secours que le site affiche si la base ne répond pas.
Les noms de fichiers suivent la même règle que nomSecours() dans app.js.
"""
import json, os, urllib.request, datetime

URL = 'https://hpfddkctmhlscfcrexnt.supabase.co/rest/v1/rpc/'
CLE = 'sb_publishable_iXhieJhE1ddxuAN0q_8N-Q_vU7NKu4y'
DOSSIER = os.path.join(os.path.dirname(__file__), '..', 'secours')

def rpc(nom, params):
    req = urllib.request.Request(URL + nom, data=json.dumps(params).encode(), method='POST',
                                 headers={'apikey': CLE, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def enregistrer(nom, params, donnees):
    cle = '_'.join(params.get(k) or 'x' for k in ('p_operateur', 'p_reseau', 'p_jusqu_au'))
    with open(os.path.join(DOSSIER, f'{nom}_{cle}.json'), 'w', encoding='utf-8') as f:
        json.dump(donnees, f, ensure_ascii=False, separators=(',', ':'))

os.makedirs(DOSSIER, exist_ok=True)
info = rpc('resultats_info', {})
enregistrer('resultats_info', {}, info)
fin = info[0]['fin_periode_memoire'] if info else None
for jusqu in [None, fin] if fin else [None]:
    base = {'p_jusqu_au': jusqu} if jusqu else {}
    for nom in ('resultats_operateurs', 'resultats_debit', 'resultats_participation', 'resultats_hors_zone_resume'):
        enregistrer(nom, base, rpc(nom, base))
    for op in (None, 'Orange', 'Yas', 'Expresso'):
        for res in (None, '4G', '3G', '2G'):
            p = dict(base)
            if op: p['p_operateur'] = op
            if res: p['p_reseau'] = res
            enregistrer('resultats_grille', p, rpc('resultats_grille', p))
            enregistrer('resultats_hors_zone', p, rpc('resultats_hors_zone', p))
with open(os.path.join(DOSSIER, 'genere_le.json'), 'w') as f:
    json.dump({'genere_le': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}, f)
print('Copie terminée :', len(os.listdir(DOSSIER)), 'fichiers')
