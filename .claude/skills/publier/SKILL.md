---
name: publier
description: Vérifie, enregistre et met en ligne MONEY QUEST (tests, build, commit, push, attente du déploiement GitHub Pages). À utiliser quand l'utilisateur dit « publie », « mets en ligne », « envoie la mise à jour » ou tape /publier.
---

Publie l'état actuel du projet, sans rien modifier d'autre. Réponses très courtes, en français.

1. `npx tsc --noEmit -p .` puis `npm test`. Si un échec : arrête-toi, explique en une phrase et propose la correction (ne pousse pas).
2. `git status --short` : s'il n'y a rien à publier, dis-le et arrête-toi.
3. `git add -A` puis commit avec un message en français qui résume les changements en une ligne (+ ligne Co-Authored-By habituelle).
4. `git push`, puis attends le déploiement :
   `ID=$(gh run list --repo lafoncorentinpro-droid/money-quest-perso --limit 1 --json databaseId --jq '.[0].databaseId'); gh run watch $ID --repo lafoncorentinpro-droid/money-quest-perso --exit-status --interval 15`
   (lancer avec un délai d'attente long ; ne pas sonder en boucle).
5. Réponds en 2 lignes max : ce qui a été publié + « Ferme puis rouvre l'app sur ton iPhone pour avoir la mise à jour ».
   Si l'icône ou le nom de l'app ont changé, préviens qu'il faut réinstaller (après export de sauvegarde).

Pas de capture d'écran, pas de vérification navigateur.
