# MONEY QUEST (version PERSO de Corentin) — fiche projet pour Claude

> ⚠️ Ce dossier est la version **personnelle** (avant la méthode des enveloppes). La version de sa copine (enveloppes) est dans le dossier voisin `money-quest`, publiée sur https://lafoncorentinpro-droid.github.io/money-quest/ — ne jamais la modifier depuis ici.
> Données locales rangées sous le nom `money-quest-perso` (séparées de l'autre app). SCHEMA_VERSION 5 pour pouvoir importer les sauvegardes de l'autre version.

PWA de budget/épargne « cozy fantasy » (renard aventurier), en français, euros, iPhone d'abord.
Données 100 % locales (IndexedDB), aucun serveur. Utilisateur : non-développeur, iPhone 13 mini.

## Économie de crédits (à respecter à chaque session)
- Réponses **courtes, en français, en tutoyant**. Pas de récapitulatif long ni de répétition du plan.
- Lire **seulement les fichiers concernés** (la carte ci-dessous suffit, pas d'exploration large).
- **Pas de capture d'écran** sauf si l'utilisateur le demande ou pour un changement visuel important : préférer `get_page_text` / JS dans la page.
- Petites modifs : `Edit` ciblé, pas de réécriture de fichier entier.
- Vérification = `npx tsc --noEmit -p .` + `npm test` (≈3 s). Navigateur seulement si l'UI change.
- Ne pas lancer de sous-agents ni de recherche web sans demande.

## Commandes
```
npm run dev      # http://localhost:5173 (si port pris : npx vite --port 5174 --strictPort)
npm test         # vitest, 50 tests, doit rester vert
npm run build    # tsc + vite build -> dist/
npm run icons    # régénère les icônes depuis public/icon-source.svg
```
Windows + Git Bash. **Pas de Python** : scripts en Node. `gh` connecté (compte lafoncorentinpro-droid).

## Publication (automatique)
`git push` sur `main` → GitHub Actions (`.github/workflows/deploy.yml`) : tests + build → GitHub Pages.
URL : https://lafoncorentinpro-droid.github.io/money-quest-perso/ — l'app installée se met à jour seule.
- Toujours `npm test` avant de pousser. Commits en français, finissant par la ligne Co-Authored-By.
- **Ne jamais changer l'icône ni le nom de l'app sans prévenir** : sur iPhone ils ne se mettent à jour qu'en réinstallant (et réinstaller efface les données locales → export/import de sauvegarde).
- Ne jamais renommer le dépôt (l'URL, donc les données de l'utilisateur, en dépendent).

## Carte du code
```
src/domain/   logique PURE et testée — aucune UI
  types.ts      modèles (montants = centimes entiers, dates 'AAAA-MM-JJ', mois 'AAAA-MM')
  finance.ts    TOUS les calculs : monthSummary, monthFlow (mois), incomeUsage, rangeStats, buildBilan, simulateur
  recurring.ts  échéances calculées à la volée, anti-doublon (recurringId + occurrenceDate)
  game.ts       XP / niveaux / régions / missions / badges / cosmétiques (refreshProgress)
  backup.ts     export/import validé, CSV, migrations (SCHEMA_VERSION dans defaults.ts)
  dates.ts money.ts defaults.ts
src/store/    reducer.ts (seul endroit qui modifie les données, pur), store.tsx (contexte, mois sélectionné), db.ts
src/forms/forms.tsx   formulaires (dépense, revenu, récurrence, objectif, mouvement, catégorie)
src/pages/    Home, Month (Mon mois + étapes Revenus/Dépenses/Épargne), MoneyViews (budget, bilan, stats,
              calendrier, simulateur, récurrences, catégories), Money (routes), Treasures, World, Profile, operations
src/ui/       components (Sheet, Field, Progress…), sheets (ouverture des formulaires), Icon (style SF Symbols), Fox (SVG), router (hash)
src/styles.css  design system : tokens iOS --fs-* (corps 17px), --tap 44px, thèmes clair/sombre
tests/        finance.test.ts, mois.test.ts, parcours.test.ts
```
Routes : `#/accueil`, `#/monde`, `#/argent[/revenus|depenses|epargne|bilan|budget|operations|recurrences|calendrier|stats|simulateur|categories]`, `#/tresors[/id]`, `#/profil`.

## Règles métier non négociables
- Montants en **centimes entiers**, jamais de flottant. Calculs **uniquement dans `finance.ts`**, jamais dans les composants.
- Reste disponible = revenus reçus − dépenses payées − versements épargne + retraits (`monthFlow.resteDisponible`).
- Épargne = transfert interne, **jamais une dépense**. Transfert entre objectifs = neutre. Remboursement = réduit la dépense, pas un revenu.
- Prévu ≠ réalisé ; annulé exclu des totaux. Aucun report implicite (report = action explicite tracée).
- `expense.incomeId` = suivi seulement, même mois obligatoire (`checkLink`), n'affecte aucun total. Supprimer un revenu → dépenses en « général ».
- Versement sans objectif → enveloppe `FREE_GOAL_ID` (« Épargne libre », target 0 = jamais « atteint »).
- Récurrences jamais stockées en double ; ne génèrent que du « prévu » jusqu'à confirmation.
- Gamification : XP pour les habitudes, **jamais selon les montants** ; rien ne se perd ; aucun ton culpabilisant.
- Aucune donnée fictive ; aucune donnée envoyée à un tiers.
- Changement du modèle de données → incrémenter `SCHEMA_VERSION` + ajouter une migration dans `backup.ts` + test.

## UI / qualité
- Cible 375×812 (iPhone 13 mini) : aucune barre horizontale, zones tactiles ≥ 44 px, texte ≥ 11 px, champs ≥ 16 px (anti-zoom iOS).
- Utiliser les tokens CSS existants (`--fs-*`, `--tap`, couleurs) et les composants existants ; icônes via `<Icon name=…/>`.
- Dates : `<input type="date" className="input">` (sélecteur natif iOS). Listes : `<select className="input">`.
- Textes UI en français, bienveillants ; les chiffres affichés passent par `money()` du store.
- Toute nouvelle règle de calcul → test dans `tests/`.
