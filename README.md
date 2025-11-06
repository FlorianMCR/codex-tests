# Matrice d'Eisenhower

Application web légère pour organiser des tâches selon la matrice d'Eisenhower. L'interface est disponible en français et espagnol, fonctionne hors-ligne (PWA) et stocke les données dans IndexedDB.

## Fonctionnalités principales
- Création, édition et suppression de tâches avec titre, description, date limite et statut terminé.
- Glisser-déposer et déplacements au clavier entre les cadrans.
- Recherche plein texte, tri par échéance ou statut.
- Comptage terminé/total par cadran, export/import JSON et réinitialisation.
- Thèmes clair/sombre avec respect de la préférence système et bascule persistante.
- Internationalisation FR/ES avec persistance du choix.
- Fonction PWA avec cache statique et fonctionnement hors-ligne.

## Raccourcis clavier
- **Tab** : navigation entre les contrôles et les tâches.
- **Entrée/Espace** sur une tâche : ouvrir la modification.
- **Suppr** sur une tâche : supprimer après confirmation.
- **Alt + Flèche** : déplacer la tâche vers le cadran indiqué (gauche/droite/haut/bas).
- **Entrée/Espace** sur une zone de cadran vide : ajouter une tâche dans ce cadran.

## Limitations connues
- Le glisser-déposer clavier nécessite que la tâche soit focalisée avant d'utiliser `Alt + Flèche`.
- Le presse-papiers natif peut ne pas être disponible selon le navigateur ; une erreur silencieuse est alors enregistrée en console.
- Les champs de date utilisent le format natif du navigateur, sans validation supplémentaire au-delà de celle du navigateur.

## Démarrage
Ouvrez simplement `index.html` dans un navigateur moderne. Pour profiter des fonctionnalités PWA, servez le dossier via un serveur HTTP (ex. `npx serve`) et acceptez l'installation du service worker.
