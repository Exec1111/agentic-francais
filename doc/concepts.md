# Glossaire & Architecture des concepts

> Référence unique des notions métier du projet.  
> **Dernière mise à jour** : 12 juin 2026

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
            └── blocs (si type = fiche_questions) ── liste de blocs hétérogènes
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

> ⚠️ **État d'implémentation** — Les 10 valeurs ci-dessous sont déclarées dans
> l'enum `RessourceTypeSchema` (elles passent la validation), mais **seules 2 sont
> réellement implémentées** dans le registre (`src/backend/resources/registry.ts`).
> Tenter de générer un type « non implémenté » lève
> `Type de ressource inconnu ou non enregistré`.

### Types implémentés (générables)

| Valeur | Label UI | Description |
|--------|----------|-------------|
| `fiche_questions` | Fiche questions | Fiche structurée en **blocs** (consigne, QCM, texte à trous, question ouverte, encadré) — voir `doc/fiche-questions-blocs.md` |
| `extrait_oeuvre` | Extrait d'œuvre | Extrait littéraire avec appareil pédagogique |

### Types déclarés mais NON implémentés (à venir)

> Aucune définition dans le registre à ce jour. Le tableau décrit l'intention.

| Valeur | Label UI | Description |
|--------|----------|-------------|
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

## Profils de différenciation

> Défini dans `src/shared/schemas.ts` — enum `DifferentiationProfilSchema`

Axe orthogonal à l'audience : une **variante** est une version élève adaptée à un profil
d'élève, dérivée d'une ressource professeur (`derived_from`).

| Profil | Public visé |
|--------|-------------|
| `standard` | version élève de référence (non adaptée) |
| `allegee` | élèves en difficulté (étayage, simplification) |
| `enrichie` | élèves rapides (approfondissement) |
| `dys` | troubles dys (phrases courtes, police adaptée) |
| `allophone` | allophones (reformulations, glossaire enrichi) |

Détail du mécanisme : [`doc/differenciation.md`](./differenciation.md).

---

## Types de blocs (`fiche_questions`)

> Défini dans `src/shared/resource-blocks.ts` — `BlocTypeSchema`

Une ressource `fiche_questions` est une **liste de blocs hétérogènes** (2 à 20).
Chaque bloc a un type qui détermine ses champs. Voir [`doc/fiche-questions-blocs.md`](./fiche-questions-blocs.md) pour la documentation complète.

| Valeur | Description |
|--------|-------------|
| `consigne` | Instruction adressée à l'élève |
| `encadre` | Rappel de cours, astuce, mise en garde, exemple |
| `qcm` | Question à choix multiples |
| `texte_a_trous` | Texte lacunaire à compléter |
| `question_ouverte` | Question rédactionnelle avec lignes de réponse |

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

> ⚠️ Les suggestions vers des types **non implémentés** (`fiche_methode`,
> `grille_evaluation`) apparaissent dans l'UI mais ne sont pas générables tant que
> leur définition n'existe pas dans le registre. Côté backend,
> `getSuggestedResourceTypes` filtre le registre et ne renvoie donc que les types
> réellement enregistrés ; la liste frontend `SUGGESTED_RESOURCES` n'a pas ce filtre.

> Configuré dans `src/backend/resources/types/*.ts` via le champ `suggestedFor`  
> et dupliqué côté frontend dans `SUGGESTED_RESOURCES` (`SequenceEditor.tsx`)

---

## Fichiers de référence

| Concept | Fichier source |
|---------|---------------|
| Types d'activité (enum) | `src/shared/schemas.ts` → `ActiviteSchema.type` |
| Types de ressource (enum) | `src/shared/schemas.ts` → `RessourceTypeSchema` |
| Types de blocs (enum) | `src/shared/resource-blocks.ts` → `BlocTypeSchema` |
| Registre des types | `src/backend/resources/registry.ts` |
| Définition `fiche_questions` | `src/backend/resources/types/fiche-questions.ts` |
| Définition `extrait_oeuvre` | `src/backend/resources/types/extrait-oeuvre.ts` |
| Config UI des types | `src/frontend/components/SequenceEditor.tsx` → `RESOURCE_TYPE_CONFIG` |
| Panneau de génération | `src/frontend/components/ResourcePanel.tsx` |

---

## Règle de nommage

- **`exercice`** (sans préfixe) = toujours un **type d'activité** (ce que font les élèves)
- **`fiche_questions`** = toujours un **type de ressource** (le document IA généré)

Cette distinction évite la confusion historique où les deux concepts portaient le même nom.
