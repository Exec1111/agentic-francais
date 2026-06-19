# Système de blocs — Fiches de questions (`fiche_questions`)

> Documentation complète du nouveau système par blocs pour les fiches de questions.
> **Dernière mise à jour** : 18 juin 2026

---

## Vue d'ensemble

Le type de ressource `fiche_questions` repose sur une **liste de blocs hétérogènes**.
Chaque bloc a un type (`consigne`, `qcm`, `texte_a_trous`, `question_ouverte`, `encadre`,
`appariement`, `remise_en_ordre`, `classement`) et ses propres champs. Cette architecture permet :

- un **rendu riche et adapté au collège** (pas de Markdown plat)
- une **édition granulaire** par le professeur (formuler dédié par type)
- une **extension aisée** (ajouter un nouveau type de bloc = suivre la recette ci-dessous)

---

## Types de blocs disponibles

| Type | Rôle | Champs principaux |
|------|------|-------------------|
| `consigne` | Instruction adressée à l'élève | `texte` |
| `encadre` | Rappel de cours, astuce, mise en garde, exemple | `texte`, `encadre_variante`, `encadre_titre` |
| `qcm` | Question à choix multiples | `question`, `propositions[]`, `bonnes_reponses[]` (PROF), `explication` (PROF) |
| `texte_a_trous` | Texte à compléter | `texte_lacunaire`, `banque_mots[]`, `reponses_trous[]` (PROF) |
| `question_ouverte` | Question rédactionnelle | `enonce`, `lignes_reponse`, `reponse_attendue` (PROF) |
| `appariement` | Relier deux colonnes (mot↔définition…) | `question`, `appariement_gauche[]`, `appariement_droite[]`, `appariement_solution[]` (PROF) |
| `remise_en_ordre` | Ré-ordonner des éléments | `question`, `remise_elements[]`, `remise_ordre[]` (PROF) |
| `classement` | Trier des items dans 2-4 catégories | `question`, `classement_categories[]`, `classement_items[]`, `classement_solution[]` (PROF) |

Tous les blocs partagent deux champs optionnels communs :
- `difficulte` : `"facile" | "moyen" | "difficile"`
- `aide` : indice affiché pour l'élève (peut être null)

### Conventions des nouveaux blocs (appariement / remise / classement)

Ces trois types encodent leur corrigé comme un tableau d'**index** parallèle aux données affichées
— jamais en réordonnant les données elles-mêmes (qui doivent rester « mélangées » côté élève) :

- **`appariement`** : `appariement_droite` est présentée dans un ordre **mélangé** (étiquetée A, B, C…).
  `appariement_solution[i]` = index (base 0) de l'item de droite correspondant à l'item de gauche `i`.
- **`remise_en_ordre`** : `remise_elements` est présentée **dans le désordre** (étiquetée A, B, C…).
  `remise_ordre` = séquence d'index dans `remise_elements` donnant l'ordre correct (ex. `[2,0,1]`).
- **`classement`** : `classement_solution[i]` = index (base 0) de la catégorie de l'item `i`.

Comme `appariement_solution`, `remise_ordre` et `classement_solution` sont des champs **PROF ONLY**,
la version élève (via `stripBlocProf`) ne révèle jamais le corrigé : les colonnes/éléments/étiquettes
restent visibles mais leur mise en correspondance est masquée.

> La liste des types « exercice » (numérotés 1, 2, 3…) est centralisée dans
> `EXERCISE_BLOC_TYPES` / `isExerciseBloc()` (`src/shared/resource-blocks.ts`) et partagée
> par le renderer Markdown (backend) et le renderer React (frontend). `consigne` et `encadre`
> ne sont pas numérotés.

---

## Architecture technique

### Schéma Zod (source de vérité)

**Fichier** : `src/shared/resource-blocks.ts`

Le schéma utilise un **modèle plat** (un seul objet `BlocSchema` avec un champ `type`
discriminant et tous les champs en `.nullable()`). Cette convention est imposée par la
compatibilité avec les **structured outputs** OpenAI (`strict: true`) et Ollama.

```ts
export const BlocSchema = z.object({
  id: z.string(),
  type: BlocTypeSchema,           // discriminant : 'consigne' | 'encadre' | 'qcm' | 'texte_a_trous' | 'question_ouverte' | 'appariement' | 'remise_en_ordre' | 'classement'
  texte: z.string().nullable(),
  encadre_variante: EncadreVarianteSchema.nullable(),
  encadre_titre: z.string().nullable(),
  question: z.string().nullable(),
  propositions: z.array(z.string()).nullable(),
  bonnes_reponses: z.array(z.number()).nullable(),   // PROF ONLY
  explication: z.string().nullable(),                // PROF ONLY
  texte_lacunaire: z.string().nullable(),
  banque_mots: z.array(z.string()).nullable(),
  reponses_trous: z.array(z.string()).nullable(),      // PROF ONLY
  enonce: z.string().nullable(),
  lignes_reponse: z.number().nullable(),
  reponse_attendue: z.string().nullable(),           // PROF ONLY
  appariement_gauche: z.array(z.string()).nullable(),
  appariement_droite: z.array(z.string()).nullable(),
  appariement_solution: z.array(z.number()).nullable(),    // PROF ONLY
  remise_elements: z.array(z.string()).nullable(),
  remise_ordre: z.array(z.number()).nullable(),            // PROF ONLY
  classement_categories: z.array(z.string()).nullable(),
  classement_items: z.array(z.string()).nullable(),
  classement_solution: z.array(z.number()).nullable(),     // PROF ONLY
  difficulte: DifficulteSchema.nullable(),
  aide: z.string().nullable(),
})
```

### Fichiers concernés

```
src/shared/resource-blocks.ts                 ← Schéma Zod + helpers
src/backend/resources/types/fiche-questions.ts ← Prompt LLM + renderer Markdown
src/frontend/components/fiche-blocs/
  parse.ts                                    ← parseFicheBlocs (sécurité / fallback)
  FicheBlocsRenderer.tsx                      ← Rendu visuel React (élève & prof)
  FicheBlocsEditor.tsx                        ← Éditeur de blocs (formuaires)
src/frontend/components/ResourcePanel.tsx     ← Intégration (mode blocs ↔ Markdown)
src/backend/repositories/resource-repo.ts     ← Persistance JSON + Markdown
src/app/api/resources/[id]/route.ts           ← PATCH contenu_json (regénère Markdown)
```

---

## Rendu professeur vs élève

### Version élève (`audience: 'eleve'`)

- Les champs **PROF ONLY** sont retirés via `toStudentVersion()` :
  `bonnes_reponses`, `explication`, `reponses_trous`, `reponse_attendue` → `null`
- Le **renderer React** les remplace visuellement :
  - QCM : pas de ✅, pas d'explication
  - Texte à trous : trous vides (`__________`)
  - Question ouverte : lignes de réponse vides
- L'aide (`aide`) est affichée si présente

### Version professeur (`audience: 'professeur'`)

- Tous les champs sont affichés
- Les réponses correctes sont mises en évidence (vert, gras)
- Les explications sont visibles

### Fallback Markdown

Si le `contenu_json` ne parse pas en blocs (ressource ancienne ou corrompue),
le `ResourcePanel` retombe automatiquement sur le rendu Markdown classique
(le `contenu_markdown` est toujours stocké en DB).

---

## Édition par le professeur

### Mode blocs actif

Quand une ressource `fiche_questions` est sélectionnée et que son `contenu_json`
contient un tableau `blocs[]`, le `ResourcePanel` bascule en **mode blocs** :

- **Aperçu** : `FicheBlocsRenderer` (visuel, adapté collège)
- **Édition** : `FicheBlocsEditor` (formulaires par bloc)

### Formulaires par bloc

| Type | Formulaire |
|------|-----------|
| `consigne` | 1 textarea |
| `encadre` | select (variante) + titre + textarea |
| `qcm` | textarea (question) + N champs texte + checkboxes bonne réponse + textarea (explication prof) + difficulté/aide |
| `texte_a_trous` | textarea (texte avec `[1]`, `[2]`) + N champs réponses + banque à mots + difficulté/aide |
| `question_ouverte` | textarea (énoncé) + nombre de lignes + textarea (réponse attendue prof) + difficulté/aide |
| `appariement` | consigne + colonne A (texte + select de la bonne lettre) + colonne B (réponses A, B, C…) + difficulté/aide |
| `remise_en_ordre` | consigne + N éléments (texte + champ « rang correct ») + difficulté/aide |
| `classement` | consigne + N catégories + N étiquettes (texte + select de la catégorie) + difficulté/aide |

### Actions globales sur les blocs

- **↕** : réordonner (boutons haut/bas)
- **🗑️** : supprimer
- **+ Ajouter un bloc** : menu avec les 8 types disponibles

### Persistance

En mode blocs, la sauvegarde envoie `contenu_json` au serveur (`PATCH /api/resources/:id`).
Le serveur **régénère automatiquement le Markdown** via `definition.toMarkdown` pour que
l'impression PDF reste cohérente.

---

## Recette : ajouter un nouveau type de bloc

### 1. Schéma (`src/shared/resource-blocks.ts`)

1. Ajouter la valeur dans `BlocTypeSchema` :
   ```ts
   export const BlocTypeSchema = z.enum([
     'consigne', 'encadre', 'qcm', 'texte_a_trous', 'question_ouverte',
     'mon_nouveau_bloc',  // ← AJOUT
   ])
   ```

2. Ajouter les champs spécifiques dans `BlocSchema` (`.nullable()`, jamais `.optional()`).

3. Documenter les champs dans `BLOC_CHAMPS_PROF` si certains sont PROF ONLY.

4. Mettre à jour `createEmptyBloc` pour initialiser le nouveau type avec ses valeurs par défaut.

5. Ajouter le libellé dans `BLOC_LABELS`.

### 2. Prompt LLM (`src/backend/resources/types/fiche-questions.ts`)

Dans le message système `buildPrompt`, ajouter une section décrivant le nouveau type :

```
6. "mon_nouveau_bloc" — description du bloc.
   • Remplis : champ1, champ2, …
   • Règles de contenu…
```

### 3. Renderer Markdown (`fiche-questions.ts` → `renderBlocMarkdown`)

Ajouter un `case` dans `renderBlocMarkdown` pour produire le Markdown fallback :

```ts
case 'mon_nouveau_bloc':
  lines.push(`**Énoncé :** ${bloc.enonce ?? ''}`)
  // …
  break
```

### 4. Renderer React (`FicheBlocsRenderer.tsx`)

1. Ajouter un composant `MonNouveauBlocView`.
2. L'enregistrer dans le `switch` de `BlocForm`.
3. Ajouter le style/variante si applicable.

### 5. Éditeur React (`FicheBlocsEditor.tsx`)

1. Créer un composant `MonNouveauBlocForm` avec les bons champs.
2. L'ajouter au switch de `BlocForm`.
3. L'ajouter au tableau `BLOC_TYPES` (ordre d'affichage dans le menu d'ajout).

### 6. Tester

- `npx tsc --noEmit`
- `npx vitest run`
- Générer une fiche et vérifier le rendu élève + prof

---

## Conventions et bonnes pratiques

### Modèle plat (pas d'union discriminée)

Les structured outputs OpenAI avec `strict: true` ne supportent pas bien les
`anyOf` / unions discriminées. On utilise donc **un seul objet** avec tous les
champs en `.nullable()`.

Le LLM est guidé par le **prompt système** qui explique quels champs remplir
selon le `type`.

### Champs PROF ONLY

Tout champ dont le nom contient une notion de correction doit être listé dans
`BLOC_CHAMPS_PROF` et mis à `null` dans `toStudentVersion`. Cela garantit que
l'élève ne voit jamais le corrigé, même si le LLM l'a généré.

### Numérotation automatique

Seuls les blocs d'exercice sont numérotés dans le renderer (la liste fait foi :
`EXERCISE_BLOC_TYPES` dans `src/shared/resource-blocks.ts` — `qcm`, `texte_a_trous`,
`question_ouverte`, `appariement`, `remise_en_ordre`, `classement`). Les blocs `consigne`
et `encadre` ne le sont pas. La numérotation est gérée par le composant `FicheBlocsRenderer`
(variable `qNum`) côté frontend et par `renderFicheMarkdown` côté backend, tous deux via
`isExerciseBloc()` / `EXERCISE_BLOC_TYPES` pour rester synchronisés.

### Fallback Markdown

Le `contenu_markdown` est toujours stocké en DB. Si le `contenu_json` ne parse
pas en blocs (ressource ancienne, type inconnu), le `ResourcePanel` retombe
automatiquement sur le rendu Markdown. Cela garantit la **compatibilité ascendante**.
