# Calculateur Rentier

[![Contrôles](https://github.com/Flavio051/calculateur-rentier/actions/workflows/verifier-et-publier.yml/badge.svg)](https://github.com/Flavio051/calculateur-rentier/actions/workflows/verifier-et-publier.yml)

À quel âge peux-tu vivre de ton capital ? Simulateur en une seule page (`index.html`), calé sur le simulateur de [Gui Storm](https://guistorm.com/rentier).

Site : https://flavio051.github.io/calculateur-rentier/

## Contrôle automatique avant publication

Chaque version est vérifiée deux fois : **avant le push** (verrou local) puis **sur GitHub** (badge ci-dessus : vert = tout est bon).

1. **Parité avec Gui Storm** : 68 profils dont les résultats ont été relevés sur guistorm.com (`tests/reference-guistorm.json`). L'âge, le capital, la rente brute, la rente nette et l'objectif avec pension doivent être identiques.
2. **Données** : 74 pays et 181 villes. Les valeurs doivent être cohérentes et aucune destination ne doit renvoyer de résultat vide (NaN).
3. **La page dans un vrai navigateur** : ouverture sans erreur, 52 ans en simplifié et 45 ans en avancé par défaut, graphiques dessinés, tableau des pays et des villes, sauvegarde des réglages, et les 68 profils relus directement à l'écran. On vérifie aussi l'affichage sur mobile (375 px) : rien ne doit déborder.

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
