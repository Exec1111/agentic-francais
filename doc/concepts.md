# Glossaire & Architecture des concepts

> Référence unique des notions métier du projet.  
> **Dernière mise à jour** : 11 juin 2026

---

## Vue d'ensemble

```
📚 SÉQUENCE
├── titre, niveau, thème, problématique
├── objectifs: string[]
├── compétences: string[]
├── corpus_refs: string[]  (textes littéraires associés)
│
└── 📅 SÉANCES (1..N)
    ├── titre, durée, objectifs
    │
    └── 🎯 ACTIVITÉS (1..N)
        ├── titre, durée, consigne
        │
        ├── type (TYPE D'ACTIVITÉ) ──── "Que fait-on ?"
        │
        └── 📄 RESSOURCES IA (0..N) ── "Quel document génère-t-on ?"
            ├── type (TYPE DE RESSOURCE)
            ├── audience (professeur | élève)
            └── format (si type = fiche_questions)
```

---

## Types d'activités

> Défini dans `src/shared/schemas.ts` — champ `ActiviteSchema.type`

Un type d'activité décrit **ce que font les élèves** pendant un moment de la séance.

| Valeur | Description |
|--------|-------------|
| `exercice` | Entraînement, pratique guidée |
| `lecture` | Lecture d'un texte littéraire |
| `production_ecrite` | Rédaction (paragraphe, texte libre…) |
| `oral` | Prise de parole, exposé, récitation |
| `debat` | Discussion argumentée, débat interprétatif |
| `evaluation` | Évaluation formative ou sommative |
| `collaboration` | Travail de groupe, co-construction |
| `recherche` | Recherche documentaire, enquête |

---

## Types de ressources

> Défini dans `src/shared/schemas.ts` — enum `RessourceTypeSchema`  
> Chaque type est implémenté dans `src/backend/resources/types/`

Un type de ressource décrit **le document généré par l'IA** pour accompagner une activité.

| Valeur | Label UI | Description |
|--------|----------|-------------|
| `fiche_questions` | Fiche questions | Questions / exercices structurés (QCM, texte à trous…) |
| `extrait_oeuvre` | Extrait d'œuvre | Extrait littéraire avec appareil pédagogique |
| `oeuvre_complete` | Texte complet | Texte court intégral annoté |
| `cours` | Cours | Cours théorique structuré |
| `bilan` | Bilan | Synthèse de séance / points clés |
| `fiche_methode` | Fiche méthode | Guide méthodologique pas à pas |
| `fiche_lecture` | Fiche lecture | Fiche de lecture structurée |
| `grille_evaluation` | Grille d'éval. | Critères et barème d'évaluation |
| `carte_mentale` | Carte mentale | Carte mentale hiérarchique |
| `dictee` | Dictée | Texte de dictée (prof uniquement) |

---

## Audiences d'une ressource

> Défini dans `src/shared/schemas.ts` — enum `RessourceAudienceSchema`

| Valeur | Description |
|--------|-------------|
| `professeur` | Version complète : corrections, justifications, notes pédagogiques |
| `eleve` | Version allégée : consignes et contenus sans réponses |

Les ressources de catégorie `TWO_VERSIONS` génèrent automatiquement les deux audiences à partir d'un seul appel LLM.

---

## Formats d'exercice (sous-type de `fiche_questions`)

> Défini dans `src/shared/schemas.ts` — enum `ExerciceFormatSchema`

Quand une ressource est de type `fiche_questions`, son contenu est structuré selon un format spécifique :

| Valeur | Description |
|--------|-------------|
| `texte_a_trous` | Texte lacunaire à compléter |
| `relier_notions` | Associer des éléments entre eux |
| `entourer_reponse` | QCM (choix multiples) |
| `questions_reponses` | Questions ouvertes avec réponse attendue |
| `libre` | Format libre / mixte |

---

## Liens : activité → ressource suggérée

Le système suggère automatiquement des types de ressources selon le type d'activité :

| Type d'activité | Ressources suggérées |
|-----------------|---------------------|
| `exercice` | `fiche_questions` |
| `lecture` | `extrait_oeuvre`, `fiche_questions` |
| `production_ecrite` | `fiche_methode` |
| `evaluation` | `fiche_questions`, `grille_evaluation` |
| `debat` | `fiche_methode` |
| `oral` | `fiche_methode` |
| `collaboration` | *(aucune suggestion auto)* |
| `recherche` | `fiche_methode` |

> Configuré dans `src/backend/resources/types/*.ts` via le champ `suggestedFor`  
> et dupliqué côté frontend dans `SUGGESTED_RESOURCES` (`SequenceEditor.tsx`)

---

## Fichiers de référence

| Concept | Fichier source |
|---------|---------------|
| Types d'activité (enum) | `src/shared/schemas.ts` → `ActiviteSchema.type` |
| Types de ressource (enum) | `src/shared/schemas.ts` → `RessourceTypeSchema` |
| Formats d'exercice (enum) | `src/shared/schemas.ts` → `ExerciceFormatSchema` |
| Registre des types | `src/backend/resources/registry.ts` |
| Définition `fiche_questions` | `src/backend/resources/types/exercice.ts` |
| Définition `extrait_oeuvre` | `src/backend/resources/types/extrait-oeuvre.ts` |
| Config UI des types | `src/frontend/components/SequenceEditor.tsx` → `RESOURCE_TYPE_CONFIG` |
| Panneau de génération | `src/frontend/components/ResourcePanel.tsx` |

---

## Règle de nommage

- **`exercice`** (sans préfixe) = toujours un **type d'activité** (ce que font les élèves)
- **`fiche_questions`** = toujours un **type de ressource** (le document IA généré)

Cette distinction évite la confusion historique où les deux concepts portaient le même nom.
