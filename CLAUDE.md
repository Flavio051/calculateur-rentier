# Calculateur Rentier : règles du dépôt

- Site statique : tout est dans `index.html` (HTML, CSS et JS dans un seul fichier, Chart.js 4.4.1 chargé depuis cdnjs). C'est la source de vérité. L'aperçu sur claude.ai en est une copie.
- Le moteur de calcul se trouve entre `/*CORE-START*/` et `/*CORE-END*/`. Il ne touche pas au DOM, parce que les tests l'exécutent dans Node. Garde-le ainsi.
- Objectif produit : des résultats identiques à https://guistorm.com/rentier pour les mêmes réglages.

## Bilan Locatif (`immobilier/index.html`)

- Même principe : un seul fichier, c'est la source de vérité. Le moteur se trouve entre `/*CORE-START*/` et `/*CORE-END*/`, sans DOM.
- Les tests `tests/immobilier-*.test.mjs` vérifient trois choses :
  - les chiffres relevés dans l'appli Cashflow Locatif (vidéo du 15/10/2026). Ne jamais les modifier pour faire passer un test ;
  - les barèmes officiels 2026 ;
  - des invariants sur 300 profils.
- Règles fiscales 2026 dans l'objet `RULES` :
  - prélèvements sociaux : 18,6 % sur les revenus BIC, 17,2 % sur les revenus fonciers et les plus-values ;
  - micro-BIC : plafond de 83 600 €, ou 15 000 € pour un meublé de tourisme non classé ;
  - barème de l'impôt sur le revenu : tranches à 11 600, 29 579, 84 577 et 181 917 € ;
  - déficit foncier imputable jusqu'à 10 700 € (21 400 € en cas de rénovation énergétique) ;
  - Jeanbrun (encore en cours de précision par l'administration) ;
  - frais de notaire : droits de mutation de 6,32 %.
- À chaque changement de loi, mettre à jour `RULES` et la note de bas de page.

## Avant tout push (obligatoire)

1. `npm ci`, puis `npx playwright install chromium` si le navigateur manque.
2. `npm test`. Le hook `.githooks/pre-push` le lance aussi automatiquement : `npm ci` exécute le script `prepare`, qui l'active (sinon `git config core.hooksPath .githooks`).
3. Ne jamais pousser si un test échoue. Ne jamais utiliser `--no-verify`.

GitHub relance les mêmes contrôles (workflow `Vérifier et publier`). Si la source Pages est « GitHub Actions », le site n'est publié que si les contrôles passent.

## Relevé Gui Storm (`tests/reference-guistorm.json`)

- Chaque valeur « attendu » est une valeur réellement affichée par Gui Storm. Ne jamais modifier une valeur attendue pour faire passer un test. On ne la change qu'après un nouveau relevé sur guistorm.com, et on met alors à jour `releve`.
- Pour un écart assumé (données différentes et non le calcul), on ajoute `ecartConnu: { champs, raison }` au cas. Le test le tolère et l'affiche.
- Pour ajouter un cas, on relève sur guistorm.com l'âge, le capital, la rente brute, la rente nette et le montant de « l'objectif tomberait à », puis on ajoute une ligne. Le champ `etat` reprend les clés du `localStorage` `calculateur-rentier-v3`.

## Commits

- Auteur : `Claude <noreply@anthropic.com>`, messages en français.
