# Guide : Ajouter un Type de Ressource

> Documentation technique pour l'ajout et la maintenance des types de ressources pédagogiques.  
> **Dernière mise à jour** : 18 juin 2026  
> Voir aussi :
> - [`doc/concepts.md`](./concepts.md) — glossaire complet des notions métier
> - [`doc/fiche-questions-blocs.md`](./fiche-questions-blocs.md) — documentation du système de blocs (type `fiche_questions`)

---

## Vue d'ensemble

Une **ressource** est un document pédagogique lié à une activité d'une séquence. Chaque ressource est générée par un LLM à partir d'un schéma structuré strict, puis rendue en Markdown pour affichage et export PDF.

### Principe fondamental : un seul appel LLM → deux documents

Le LLM produit **un objet JSON complet** contenant toutes les informations (y compris corrections et notes pédagogiques). On en dérive ensuite deux versions par filtrage :

```
LLM génère → ResourceComplet (JSON structuré)
                  │
                  ├─→ toMarkdown.professeur(resource)  →  Document Prof
                  └─→ toMarkdown.eleve(resource)       →  Document Élève
```

Cela garantit la cohérence entre les deux versions (même exercice, même corrigé).

---

## Catégories de ressources

| Catégorie | Description | Exemple |
|-----------|-------------|---------|
| `TWO_VERSIONS` | Génère un document élève ET un document prof | `fiche_questions`, `cours`, `extrait_oeuvre` |
| `TEACHER_ONLY` | Un seul document, à destination du professeur uniquement | *(aucun type implémenté à ce jour ; `dictee` est prévu)* |

## Deux familles d'implémentation

Au-delà de la catégorie (1 ou 2 versions), un type appartient à l'une de deux **familles** :

| Famille | Principe | Rendu / édition | Types |
|---------|----------|-----------------|-------|
| 🟦 **Document par blocs** | `contenu_json` = liste de blocs hétérogènes. Framework de rendu/édition **partagé** (renderer + éditeur visuel React, création manuelle « vierge »). | React riche + Markdown/PDF + éditeur de blocs | `fiche_questions` (blocs d'exercice), `cours` / `fiche_methode` / `bilan` (blocs de contenu) |
| 🟧 **Schéma dédié** | `contenu_json` = schéma sur-mesure propre au type. | Markdown/PDF uniquement (édition Markdown brut) | `extrait_oeuvre` |

**Quand choisir l'une ou l'autre ?**
- *Document par blocs* pour les contenus **linéaires et hétérogènes** où l'on veut la composition manuelle et un rendu riche (cours, méthode, bilan, exercices).
- *Schéma dédié* pour les structures **fortes et spécifiques** (matrice d'une grille d'évaluation, graphe d'une carte mentale, texte + appareil d'un extrait).

### Brancher un type « document par blocs »

1. **Schéma** : `src/shared/resource-blocks-<type>.ts` (modèle plat nullable, helpers, `createBlank<Type>Contenu`).
2. **Définition backend** : `src/backend/resources/types/<type>.ts` + prompt dans `src/backend/prompts/<type>.ts`. Fournir `template: () => createBlank<Type>Contenu()` pour activer la création manuelle.
3. **Composants React** : `src/frontend/components/<type>-blocs/` (`parse.ts`, `<Type>BlocsRenderer.tsx`, `<Type>BlocsEditor.tsx`).
4. **Registre frontend** : ajouter une entrée dans `src/frontend/components/blocs-registry.tsx` (libellé « … vierge » + parse + Renderer + Editor). Le `ResourcePanel` et la création manuelle deviennent automatiquement disponibles pour ce type.

> La création manuelle (« Créer vierge ») et la synchronisation prof→élève à la sauvegarde
> sont **génériques** : tout type exposant un `template` et inscrit au registre frontend en bénéficie sans code supplémentaire.

> **Pour ajouter une catégorie** (ex. `STUDENT_ONLY` pour une affiche) : ajouter la valeur dans `ResourceCategory` dans `src/shared/schemas/resource.ts` et gérer le cas dans le `ResourceRegistry`.

---

## Architecture du système

### Fichiers impliqués

```
src/
├── shared/
│   └── schemas/
│       └── resource.ts           ← Schémas Zod + types TypeScript
│
├── backend/
│   └── resources/
│       ├── registry.ts           ← Registre central de tous les types
│       ├── types/
│       │   ├── exercice.ts       ← Définition du type exercice
│       │   ├── cours.ts          ← Définition du type cours
│       │   └── [type].ts         ← Un fichier par type
│       └── generator.ts          ← Appel LLM + dérivation des deux versions
│
└── app/
    └── api/
        └── generate/
            └── resource/
                └── route.ts      ← Point d'entrée API
```

### Interface `ResourceTypeDefinition<T>`

Chaque type de ressource implémente cette interface (définie dans `registry.ts`) :

```typescript
interface ResourceTypeDefinition<T> {
  /**
   * Identifiant unique du type, snake_case.
   * Doit correspondre exactement à la valeur dans RessourceTypeSchema.
   */
  type: RessourceType;

  /**
   * Catégorie : détermine si on génère 1 ou 2 versions.
   */
  category: 'TWO_VERSIONS' | 'TEACHER_ONLY';

  /**
   * Schéma Zod du document complet (version professeur, tous champs inclus).
   * Utilisé pour valider la sortie LLM.
   */
  schema: z.ZodSchema<T>;

  /**
   * Transforme le document complet en version élève.
   * Obligatoire si category === 'TWO_VERSIONS'.
   * Doit supprimer : corrections, justifications, notes pédagogiques.
   */
  toStudentVersion?: (full: T) => DeepPartial<T>;

  /**
   * Construit le prompt utilisateur envoyé au LLM.
   * Le prompt système générique est fourni par generator.ts.
   */
  buildPrompt: (context: ResourceGenerationContext) => string;

  /**
   * Post-traitement appliqué APRÈS validation de la sortie LLM, AVANT la
   * dérivation des versions prof/élève. À utiliser pour injecter par code
   * des données de référence plutôt que de les faire recopier par le LLM.
   * Exemple : extrait_oeuvre injecte le texte corpus exact (numéroté par
   * numberTextLines) et écrase les métadonnées bibliographiques — le LLM
   * laisse le champ "texte" vide et ne produit que l'appareil pédagogique.
   */
  postProcess?: (full: T, context: ResourceGenerationContext) => T;

  /**
   * Renderers Markdown. 'professeur' est toujours requis.
   * 'eleve' est requis si category === 'TWO_VERSIONS'.
   */
  toMarkdown: {
    professeur: (resource: T) => string;
    eleve?: (resource: T) => string;
  };

  /**
   * Types d'activités pour lesquels ce type de ressource est
   * automatiquement suggéré lors de la validation d'une activité.
   */
  suggestedFor: ActiviteType[];
}
```

---

## Recette : ajouter un nouveau type en 5 étapes

### Étape 1 — Définir le schéma Zod

Dans `src/shared/schemas/resource.ts`, ajouter le schéma du document **complet** (version prof, tous les champs). Les champs destinés exclusivement au professeur sont marqués avec `.optional()` et documentés avec un commentaire `// PROF ONLY`.

```typescript
// src/shared/schemas/resource.ts

export const MonNouveauTypeSchema = z.object({
  titre: z.string(),

  // Champ commun élève et prof
  contenu: z.string(),

  // PROF ONLY — supprimé dans toStudentVersion()
  note_pedagogique: z.string().optional(),
  correction: z.string().optional(),
});

export type MonNouveauType = z.infer<typeof MonNouveauTypeSchema>;
```

**Règle d'or** : Ne jamais mettre un champ prof dans un objet imbriqué partagé avec l'élève sans le documenter explicitement. La clarté ici évite des fuites d'informations dans la version élève.

Puis ajouter le nouveau type à l'union `RessourceTypeSchema` :

```typescript
export const RessourceTypeSchema = z.enum([
  'exercice',
  'cours',
  // ...types existants...
  'mon_nouveau_type',   // ← ajouter ici
]);
```

---

### Étape 2 — Créer le fichier de définition du type

Créer `src/backend/resources/types/mon-nouveau-type.ts` :

```typescript
import { z } from 'zod';
import type { ResourceTypeDefinition } from '../registry';
import { MonNouveauTypeSchema, type MonNouveauType } from '@/shared/schemas/resource';

export const monNouveauTypeDefinition: ResourceTypeDefinition<MonNouveauType> = {

  type: 'mon_nouveau_type',
  category: 'TWO_VERSIONS',  // ou 'TEACHER_ONLY'
  schema: MonNouveauTypeSchema,

  // ── Transformation vers la version élève ──────────────────────────
  // Supprimer TOUS les champs PROF ONLY identifiés dans le schéma.
  toStudentVersion: (full) => ({
    titre: full.titre,
    contenu: full.contenu,
    // note_pedagogique : omis volontairement
    // correction : omis volontairement
  }),

  // ── Prompt utilisateur ────────────────────────────────────────────
  // Le prompt SYSTÈME (rôle du LLM, format JSON attendu, règles corpus)
  // est injecté automatiquement par generator.ts.
  // Ici on ne fournit que le contexte spécifique à la demande.
  buildPrompt: (ctx) => `
Génère un document de type "mon_nouveau_type" pour :
- Niveau : ${ctx.niveau}
- Activité : ${ctx.activite.titre} (${ctx.activite.type})
- Objectif pédagogique : ${ctx.activite.consigne}
${ctx.corpus ? `- Texte au programme : "${ctx.corpus.titre}" de ${ctx.corpus.auteur}` : ''}

Contraintes :
- [spécifier les contraintes propres à ce type]
- Respecter le schéma JSON fourni dans les instructions système.
- Ne PAS inventer de texte littéraire si un corpus est fourni.
  `.trim(),

  // ── Renderers Markdown ────────────────────────────────────────────
  toMarkdown: {

    professeur: (r) => [
      `# ${r.titre} — *Fiche professeur*`,
      '',
      r.contenu,
      '',
      r.note_pedagogique ? `> 📝 **Note pédagogique :** ${r.note_pedagogique}` : '',
      r.correction ? `\n---\n## Corrigé\n\n${r.correction}` : '',
    ].filter(Boolean).join('\n'),

    eleve: (r) => [
      `# ${r.titre}`,
      '',
      r.contenu,
    ].join('\n'),

  },

  // ── Suggestions automatiques ──────────────────────────────────────
  // Ce type sera proposé automatiquement quand une activité
  // de l'un de ces types est validée.
  suggestedFor: ['exercice', 'evaluation'],

};
```

---

### Étape 3 — Enregistrer le type dans le registre

Dans `src/backend/resources/registry.ts`, importer et enregistrer :

```typescript
import { monNouveauTypeDefinition } from './types/mon-nouveau-type';

export const RESOURCE_REGISTRY: ResourceTypeDefinition<unknown>[] = [
  exerciceDefinition,
  coursDefinition,
  // ...types existants...
  monNouveauTypeDefinition,   // ← ajouter ici
];

// Index par type pour accès O(1)
export const RESOURCE_REGISTRY_MAP = Object.fromEntries(
  RESOURCE_REGISTRY.map(def => [def.type, def])
);
```

À partir de là, le générateur (`generator.ts`) et l'API de suggestion automatique utilisent ce registre — **aucune autre modification n'est nécessaire** pour brancher le nouveau type dans le pipeline.

---

### Étape 4 — Écrire le prompt système

Le prompt système générique (dans `generator.ts`) injecte automatiquement :
- Le rôle du LLM (expert pédagogique)
- Le schéma JSON attendu (dérivé du schéma Zod)
- Les règles corpus (interdiction d'inventer des textes)
- L'instruction de retourner du JSON pur sans balises Markdown

Si le type nécessite des instructions **supplémentaires dans le prompt système** (ex. règles spécifiques de formatage), on peut surcharger via le champ optionnel `systemPromptAddendum` dans la définition :

```typescript
systemPromptAddendum: `
Pour ce type, chaque item doit avoir exactement 3 niveaux de difficulté.
Ne jamais dépasser 5 items par exercice.
`,
```

---

### Étape 5 — Vérifier la checklist

Avant de considérer le type comme complet :

- [ ] Schéma Zod défini avec commentaires `// PROF ONLY` sur chaque champ sensible
- [ ] `RessourceTypeSchema` mis à jour
- [ ] Fichier de définition créé dans `src/backend/resources/types/`
- [ ] Type enregistré dans `registry.ts`
- [ ] `toStudentVersion` implémenté (si `TWO_VERSIONS`) — vérifier qu'aucun champ prof ne fuite
- [ ] `buildPrompt` écrit avec contexte suffisant pour le LLM
- [ ] `toMarkdown.professeur` produit un Markdown lisible et complet
- [ ] `toMarkdown.eleve` produit un Markdown sans aucune réponse ni note prof
- [ ] `suggestedFor` renseigné avec les types d'activités pertinents
- [ ] Test manuel : générer la ressource, vérifier les deux versions, exporter en PDF

---

## Référence : types existants et leurs spécificités

### Types implémentés (enregistrés dans le registre)

| Type | Catégorie | Champs PROF ONLY | Suggéré pour |
|------|-----------|-----------------|--------------|
| `fiche_questions` | TWO_VERSIONS | `blocs[].bonnes_reponses` (QCM), `blocs[].explication` (QCM), `blocs[].reponses_trous` (texte à trous), `blocs[].reponse_attendue` (question ouverte), `blocs[].appariement_solution`, `blocs[].remise_ordre`, `blocs[].classement_solution` | `exercice`, `evaluation` |
| `cours` | TWO_VERSIONS | `blocs[].note_prof`, `note_prof_globale` | `lecture`, `oral` |
| `fiche_methode` | TWO_VERSIONS | `blocs[].note_prof`, `note_prof_globale` | `production_ecrite`, `exercice` |
| `bilan` | TWO_VERSIONS | `blocs[].note_prof`, `blocs[].checklist_remediation` (auto-évaluation), `note_prof_globale` | `evaluation`, `exercice` |
| `extrait_oeuvre` | TWO_VERSIONS | `questions[].reponse_attendue`, `questions[].elements_analyse`, `note_prof` | `lecture`, `debat` |
| `oeuvre_complete` | TWO_VERSIONS | `questions[].reponse_attendue`, `questions[].elements_analyse`, `questions_approfondissement[].pistes`, `note_prof` | `lecture` |
| `fiche_lecture` | TWO_VERSIONS | `sections[].questions[].reponse_attendue`, `note_prof` | `lecture`, `recherche` |
| `grille_evaluation` | TWO_VERSIONS | `competences[].niveaux[].points`, `total_points`, `bareme`, `note_prof` | `production_ecrite`, `evaluation`, `oral` |
| `carte_mentale` | TWO_VERSIONS | nœuds `a_completer` masqués côté élève, `note_prof` | `recherche`, `collaboration` |
| `dictee` | TEACHER_ONLY | *(document entier, pas de version élève)* | `exercice`, `evaluation` |

**Les 10 types déclarés dans `RessourceTypeSchema` sont désormais implémentés.**

Les 5 premiers (🟦) sont de la famille « document par blocs » ; `extrait_oeuvre`, `oeuvre_complete`,
`fiche_lecture`, `grille_evaluation`, `carte_mentale` et `dictee` (🟧) sont de la famille « schéma
dédié » (rendu Markdown sur-mesure, édition via le Markdown brut, pas d'éditeur de blocs).

> Note : `src/shared/resource-schemas.ts` contient encore d'anciens schémas bespoke
> (`CoursContenuSchema`, `BilanContenuSchema`, `FicheMethodeContenuSchema`) issus de
> l'intention de conception initiale. Ils sont **inutilisés** : `cours`, `bilan` et
> `fiche_methode` reposent sur la famille « blocs » (`resource-blocks-*.ts`). À nettoyer.

---

## Contexte pédagogique des prompts

Chaque `buildPrompt` doit intégrer le bloc de contexte partagé via
`buildContextePedagogique(ctx)` (`src/backend/resources/prompt-context.ts`). Ce bloc combine :

- le contexte de la séquence (titre, problématique, objectifs, compétences) ;
- la **progression** (toutes les séances, avec la séance actuelle marquée) ;
- le contexte de la séance (objectifs) et de l'activité (type, durée, consigne, autres activités) ;
- les **repères du programme officiel** pour le niveau (`src/backend/pedagogie/programmes.ts` :
  entrées du programme, attendus de langue/écriture/lecture, calibrage de la difficulté — niveaux 6e à terminale).

Les champs enrichis sont optionnels (`ResourceGenerationContext`) : ils sont remplis par
`SequenceEditor.openResourcePanel` côté frontend et transmis via le body de
`POST /api/generate/resource`. Le bloc se dégrade proprement s'ils sont absents.

---

## Pièges courants à éviter

**1. Fuite de corrections dans la version élève**  
Toujours tester `toStudentVersion` en loggant le résultat et en cherchant manuellement des réponses visibles. Une revue de code doit inclure la vérification que chaque champ `// PROF ONLY` est bien absent de `toStudentVersion`.

**2. Prompt trop vague**  
Le LLM doit recevoir suffisamment de contexte pour ne pas inventer. Si le corpus est fourni, le `buildPrompt` doit **toujours** l'intégrer explicitement. Un prompt sans mention du corpus produit du contenu inventé même si le corpus est disponible.

**3. Schéma Zod trop permissif**  
Éviter `z.any()` et `z.record()` dans les schémas de ressources. Chaque champ doit être typé précisément — cela force le LLM à respecter la structure et facilite les deux renderers Markdown.

**4. `suggestedFor` vide**  
Un type avec `suggestedFor: []` ne sera jamais suggéré automatiquement lors de la validation d'une activité. Il sera toujours accessible manuellement, mais perd l'intérêt du workflow automatique.

**5. Renderer Markdown non testé sur mobile/PDF**  
Le Markdown est rendu dans le Resource Panel ET exporté en PDF. Tester les deux. Les tableaux Markdown longs cassent souvent sur PDF — préférer des listes ou des sections séparées pour les grilles d'évaluation.
