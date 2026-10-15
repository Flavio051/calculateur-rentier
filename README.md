# Calculateur Rentier et Bilan Locatif

[![Contrôles](https://github.com/Flavio051/calculateur-rentier/actions/workflows/verifier-et-publier.yml/badge.svg)](https://github.com/Flavio051/calculateur-rentier/actions/workflows/verifier-et-publier.yml)

À quel âge peux-tu vivre de ton capital ? Simulateur en une seule page (`index.html`), calé sur le simulateur de [Gui Storm](https://guistorm.com/rentier).

Site : https://flavio051.github.io/calculateur-rentier/

**Bilan Locatif** (`immobilier/index.html`) : analyse d'un investissement locatif pour ordinateur. Cash-flow, rendements, crédit (trois types de prêt, différé), six régimes fiscaux 2026 (LMNP micro-BIC et réel, micro-foncier, réel foncier, Jeanbrun, SCI à l'IS), revente et plus-value, TRI, VAN et leviers d'amélioration. Site : https://flavio051.github.io/calculateur-rentier/immobilier/

## Contrôle automatique avant publication

Chaque version est vérifiée deux fois : **avant le push** (verrou local) puis **sur GitHub** (badge ci-dessus : vert = tout est bon).

1. **Parité avec Gui Storm** : 68 profils dont les résultats ont été relevés sur guistorm.com (`tests/reference-guistorm.json`). L'âge, le capital, la rente brute, la rente nette et l'objectif avec pension doivent être identiques.
2. **Données** : 74 pays et 181 villes. Les valeurs doivent être cohérentes et aucune destination ne doit renvoyer de résultat vide (NaN).
3. **La page dans un vrai navigateur** : ouverture sans erreur, 52 ans en simplifié et 45 ans en avancé par défaut, graphiques dessinés, tableau des pays et des villes, sauvegarde des réglages, et les 68 profils relus directement à l'écran. On vérifie aussi l'affichage sur mobile (375 px) : rien ne doit déborder.

4. **Bilan Locatif**
   - Le moteur reproduit les 42 chiffres relevés dans l'appli Cashflow Locatif : mensualité, coût du crédit, impôt micro-BIC, cash-flow, plus-value, flux, enrichissement, VAN et TRI.
   - Il respecte les barèmes officiels 2026 : frais de notaire, impôt sur le revenu avec quotient familial et décote, abattements et surtaxe sur la plus-value.
   - Il reste cohérent sur 300 profils tirés au hasard.
   - La page est testée dans un navigateur : saisie, sauvegarde, simulations, export et import, mobile et thème sombre.

Si un seul contrôle échoue, le push est refusé.

Les écarts connus, tolérés et affichés à chaque contrôle :

- devises CHF et USD : Gui Storm arrondit différemment, avec un écart d'environ 1 € sur la rente ;
- Maroc : la rente brute affichée diffère (Gui Storm l'affiche avec 15 % d'impôt mais calcule avec 10 %), mais l'âge et le capital sont identiques.

### Lancer les contrôles soi-même

```sh
npm install                          # outils de test + active le verrou avant push
npx playwright install chromium      # navigateur de test (une seule fois)
npm test
```

### Publication sans risque

Dans **Settings → Pages → Build and deployment → Source**, choisis **GitHub Actions**. Le site n'est alors mis à jour que si tous les contrôles passent. Avec « Deploy from a branch », GitHub publie la branche `main` directement. Les contrôles tournent quand même et le badge le montre, mais ils ne bloquent pas la mise en ligne.
