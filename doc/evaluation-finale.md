# Spécification — Génération de l'évaluation finale

> Spec d'implémentation. Génère, en un clic et à partir du **contenu complet de la
> séquence**, le bundle de documents de l'évaluation finale.
> **Statut** : ✅ implémenté (23 juin 2026) · **Dernière mise à jour** : 23 juin 2026
> Voir aussi : [`doc/concepts.md`](./concepts.md), [`doc/resource-types.md`](./resource-types.md), [`doc/architecture.md`](./architecture.md)

---

## 1. Objectif & périmètre

La zone « Évaluation finale » d'une séquence est aujourd'hui un simple champ texte
(`SequenceSchema.evaluation_finale`), le plus souvent vide. On ajoute un bouton
**« Générer l'évaluation finale »** qui produit, en une opération, **un bundle de
3 documents** cohérents, ancrés sur l'intégralité de la séquence (objectifs,
compétences, séances, activités, corpus, repères du programme).

### Le bundle (3 documents)

| # | Document | Type de ressource | Audience persistée |
|---|----------|-------------------|--------------------|
| A | Sujet d'évaluation — version élève | `evaluation_sommative` (**nouveau**) | élève |
| B | Sujet d'évaluation — version prof (barème + corrigé intégrés) | `evaluation_sommative` | professeur |
| C | Grille + Q/R d'autoévaluation corrigées | `grille_evaluation` (**étendu**) | élève uniquement |

### Décisions actées (et leurs conséquences)

- **Le barème de notation vit uniquement dans le sujet prof (B).** On ne génère
  pas de grille critériée prof distincte pour le bundle. → 3 documents, pas 4.
- **On étend `grille_evaluation`, on ne crée pas de nouveau type d'autoévaluation.**
  Le type reste `TWO_VERSIONS` (son usage au niveau activité est inchangé) ; on lui
  ajoute des champs **optionnels** qui ne s'activent qu'en contexte évaluation finale.
  Dans le bundle, **on ne persiste que la version élève** de la grille (la version
  prof — points/barème — est produite mais ignorée).
- **La catégorie `STUDENT_ONLY` n'est PAS nécessaire** (conséquence directe du point
  précédent) : aucun refactor du type de retour de `generateResourcePair`.
- **`grille_evaluation` et `bilan` sont conservés** tels quels — la grille garde sa
  valeur autonome (notation critériée d'une production écrite/orale intermédiaire),
  le bilan a une finalité distincte (synthèse/consolidation).

### Hors périmètre (volontairement)

- Formats d'examen officiels (DNB, EAF, commentaire, dissertation). Le sujet généré
  est une évaluation sommative « maison » alignée sur la séquence, pas un sujet type examen.
- Différenciation (versions allégée/enrichie/dys) du sujet.

---

## 2. Modèle de données

### 2.1 Migration DB — rattachement au niveau séquence

Les ressources ne savent aujourd'hui se rattacher qu'à une **activité**
(`ressources.activite_id`, cf. [`db.ts`](../src/backend/db.ts) table `ressources`,
migration v4). L'évaluation finale se rattache à la **séquence**. Ajouter la
migration **v8** dans le tableau `MIGRATIONS` de `db.ts` :

```ts
{
  version: 8,
  name: 'ressources_sequence_scope',
  sql: `
    ALTER TABLE ressources ADD COLUMN sequence_id TEXT REFERENCES sequences(id) ON DELETE CASCADE;
    ALTER TABLE ressources ADD COLUMN scope       TEXT NOT NULL DEFAULT 'activite';
    CREATE INDEX IF NOT EXISTS idx_ressources_sequence ON ressources(sequence_id);
  `,
},
```

- `scope` ∈ `{ 'activite', 'evaluation_finale' }`. Valeur par défaut `'activite'`
  → les ressources existantes restent valides sans backfill.
- `sequence_id` nullable : renseigné uniquement pour `scope = 'evaluation_finale'`.
- Invariant : une ressource a **soit** `activite_id` (scope `activite`), **soit**
  `sequence_id` (scope `evaluation_finale`). Non imposé par contrainte SQL (laissé
  au code applicatif).

### 2.2 Schéma `RessourceStructuree` (`src/shared/schemas.ts`)

Ajouter deux champs optionnels :

```ts
export const RessourceStructureeSchema = z.object({
  // … champs existants …
  sequence_id: z.string().optional(),
  scope: z.enum(['activite', 'evaluation_finale']).optional(),
})
```

### 2.3 Repository (`src/backend/repositories/resource-repo.ts`)

- `saveRessourcePaire` : persister `sequence_id` et `scope` (les deux `upsertStmt.run`
  passent `paire.*.sequence_id ?? null` et `paire.*.scope ?? 'activite'`). Mettre à
  jour la requête `INSERT ... ON CONFLICT` et `rowToRessource`.
- Nouvelles fonctions :
  ```ts
  export function getRessourcesBySequenceScope(
    sequenceId: string,
    scope: 'evaluation_finale'
  ): RessourceStructuree[]

  /** Supprime toutes les ressources d'un scope séquence (pour régénération propre). */
  export function deleteRessourcesBySequenceScope(
    sequenceId: string,
    scope: 'evaluation_finale'
  ): number
  ```
  `deleteRessourcesBySequenceScope` doit supprimer **toutes** les lignes du scope (les
  paires entières), dans une transaction.

### 2.4 API `/api/resources` (`src/app/api/resources/route.ts`)

Étendre le `GET` : accepter `?sequence_id=…&scope=evaluation_finale` **en plus** de
`?activite_id=…`. Si `sequence_id` est fourni, router vers
`getRessourcesBySequenceScope`. Conserver le comportement `activite_id` à l'identique.

---

## 3. Type `evaluation_sommative` (documents A + B)

Famille « schéma dédié » (rendu Markdown sur-mesure), catégorie `TWO_VERSIONS`.

### 3.1 Schéma (`src/shared/resource-schemas.ts`)

```ts
export const EvalQuestionSchema = z.object({
  numero: z.number(),
  enonce: z.string(),
  competence_evaluee: z.string(),       // relie la question à une compétence de la séquence
  bareme_points: z.number().nullable(), // PROF ONLY
  corrige: z.string().nullable(),       // PROF ONLY — réponse attendue / éléments de correction
})

export const EvaluationSommativeContenuSchema = z.object({
  titre: z.string(),
  consignes_generales: z.string(),      // durée, matériel autorisé, modalités
  support_texte: z.string().nullable(), // texte à analyser (extrait corpus OU texte court ad hoc)
  questions: z.array(EvalQuestionSchema).min(1),
  total_points: z.number().nullable(),  // PROF ONLY
  bareme: z.string().nullable(),        // PROF ONLY — conversion points → /20
  note_prof: z.string().nullable(),     // PROF ONLY — conseils de passation / corrigé global
})
export type EvaluationSommativeContenu = z.infer<typeof EvaluationSommativeContenuSchema>
```

Ajouter `'evaluation_sommative'` à l'enum `RessourceTypeSchema` (`src/shared/schemas.ts`).

### 3.2 Définition (`src/backend/resources/types/evaluation-sommative.ts`)

```ts
export const evaluationSommativeDefinition: ResourceTypeDefinition<EvaluationSommativeContenu> = {
  type: 'evaluation_sommative',
  label: "Sujet d'évaluation",
  category: 'TWO_VERSIONS',
  schema: EvaluationSommativeContenuSchema,

  toStudentVersion: (full) => ({
    titre: full.titre,
    consignes_generales: full.consignes_generales,
    support_texte: full.support_texte,
    questions: full.questions.map((q) => ({
      numero: q.numero,
      enonce: q.enonce,
      competence_evaluee: q.competence_evaluee, // visible : l'élève sait ce qui est évalué
      bareme_points: null, // PROF ONLY
      corrige: null,       // PROF ONLY
    })),
    total_points: null, // PROF ONLY
    bareme: null,       // PROF ONLY
    note_prof: null,    // PROF ONLY
  }),

  buildPrompt: (ctx) => [ /* cf. §5 — utilise ctx.sequenceDigest */ ],

  toMarkdown: {
    professeur: (r) => renderEvalMarkdown(r, 'professeur'), // affiche barème + corrigé par question
    eleve: (r) => renderEvalMarkdown(r, 'eleve'),           // énoncés + lignes de réponse
  },

  suggestedFor: [], // jamais suggéré au niveau activité ; déclenché par le bouton séquence
}
```

L'enregistrer dans `RESOURCE_REGISTRY` (`src/backend/resources/registry.ts`).

> **Garde-fou anti-fuite** (piège #1 de `resource-types.md`) : test unitaire qui
> vérifie que `toStudentVersion` produit `bareme_points/corrige/total_points/bareme/note_prof`
> tous à `null`.

### 3.3 Rendu Markdown

- **prof** : pour chaque question, énoncé + `[… pts]` + bloc « Corrigé : … » ; total,
  barème et note de passation en pied. Rendu en sections (pas un grand tableau) pour
  l'export PDF (piège #5).
- **élève** : énoncé + (optionnel) compétence évaluée en italique + lignes de réponse
  vides. Pas de points, pas de corrigé.

---

## 4. Extension de `grille_evaluation` (document C)

### 4.1 Schéma (`src/shared/resource-schemas.ts`)

Ajouter **deux champs optionnels** à `GrilleEvaluationContenuSchema` (sans toucher
aux champs existants → usage activité préservé) :

```ts
export const GrilleAutoControleSchema = z.object({
  question: z.string(),
  reponse: z.string(), // réponse fournie d'emblée (autocontrôle, pas un exercice noté)
})

export const GrilleEvaluationContenuSchema = z.object({
  // … champs existants (objectif, competences, total_points, bareme, note_prof) …
  questions_autocontrole: z.array(GrilleAutoControleSchema).nullable(), // activé en contexte éval finale
  conseils_revision: z.string().nullable(),
})
```

### 4.2 Définition (`src/backend/resources/types/grille-evaluation.ts`)

- **Catégorie inchangée** (`TWO_VERSIONS`) — comportement activité identique.
- `buildPrompt` : demander `questions_autocontrole` + `conseils_revision`
  **uniquement** si `ctx.evaluationFinale === true` (cf. §5). Sinon, instruire le LLM
  de les laisser à `null` (champs nullable, donc valides absents).
- `toStudentVersion` : recopier `questions_autocontrole` et `conseils_revision` (ce
  sont des champs **élève** — ils contiennent les réponses d'autocontrôle, ce qui est
  voulu). Seuls `points/total_points/bareme/note_prof` restent PROF ONLY → `null`.
- Renderer (`renderGrilleMarkdown`) : afficher une section « Auto-évaluation » **si**
  `questions_autocontrole` est non vide (Q + réponse), puis « Conseils de révision »
  si présent. Comportement actuel intact quand les champs sont absents.

### 4.3 Dans le bundle

L'orchestrateur génère la paire grille, puis **ne persiste que `paire.eleve`**
(scope `evaluation_finale`). La version prof est produite par le même appel LLM mais
n'est ni persistée ni renvoyée.

---

## 5. Contexte LLM

### 5.1 Champs ajoutés à `ResourceGenerationContext` (`registry.ts`)

```ts
export interface ResourceGenerationContext {
  // … existant …
  /** Digest texte de la séquence complète (cf. buildSequenceDigest). */
  sequenceDigest?: string
  /** Sujet d'évaluation déjà généré (contenu_json prof), injecté pour aligner la grille. */
  sujetGenere?: unknown
  /** Active la production des champs d'autoévaluation de la grille. */
  evaluationFinale?: boolean
}
```

Tous optionnels → les types existants les ignorent, aucune régression.

### 5.2 `buildSequenceDigest(sequence, corpusItems)` (`src/backend/resources/prompt-context.ts`)

Nouveau builder, à côté de `buildContextePedagogique`. Produit un bloc texte décrivant
**toute** la séquence :

- titre, niveau, thème, problématique ;
- **objectifs** et **compétences** de la séquence (l'ancrage de l'évaluation) ;
- pour chaque séance : numéro, titre, objectifs, et liste des activités (`titre` +
  `type`) → ce qui a été *travaillé* ;
- **le contenu des ressources produites en classe** (cours, fiches, exercices), injecté
  sous chaque activité (version prof, plafonné par `RESSOURCE_EXCERPT_CAP`) : l'endpoint
  les récupère via `getRessourcesByActivite(activite.id)` et les filtre sur
  `EVAL_CONTENT_TYPES` (`cours`, `fiche_questions`, `fiche_methode`, `bilan`,
  `fiche_lecture`, `carte_mentale`). Objectif : que l'évaluation puise ses notions dans
  les cours et imite le format des exercices réellement faits en classe. ⚠️ Surveiller
  `num_ctx` (Ollama) : le contenu des ressources gonfle le prompt ;
- corpus étudié : titres/auteurs résolus depuis `sequence.corpus_refs`
  (réutiliser le mécanisme de `buildCorpusContextBlock`) ;
- repères du programme du niveau via `getProgrammeReperes(niveau)`.

### 5.3 Consignes de prompt (les deux types)

Prompt système commun à insister sur :

1. **N'évaluer que ce qui a été enseigné** dans la séquence (s'appuyer sur le digest).
2. **Couverture des compétences** : chaque compétence annoncée doit être évaluée par
   au moins une question (`competence_evaluee`). Si une compétence n'est pas évaluable
   à l'écrit (ex. oral), le signaler dans `note_prof` plutôt que d'inventer une question.
3. **Calibrage** sur le niveau (repères programme).
4. **Support texte** : si un texte du corpus se prête à l'analyse, fonder le sujet
   dessus (le citer dans `support_texte`) ; sinon proposer un texte court inédit adapté.
5. Pour la grille (contexte éval finale) : les `questions_autocontrole` doivent
   **porter sur les questions réellement posées dans le sujet** (`ctx.sujetGenere`).
6. Respecter les instructions libres du professeur (`ctx.consignes`) en priorité.

---

## 6. Orchestration — endpoint `/api/generate/evaluation`

Nouveau endpoint (distinct de `/api/generate/resource`, qui reste activité-centré).

**Fichier** : `src/app/api/generate/evaluation/route.ts`
**Body** : `{ sequenceId: string, sequence: Sequence, provider?: 'openai'|'ollama', consignes?: string }`

### 6.1 Algorithme (génération chaînée — garantit la cohérence)

```
1. Valider le body. Refuser si la séquence n'a pas d'id persisté (cf. §7 garde-fou).
2. corpusItems = sequence.corpus_refs.map(getCorpusById).filter(Boolean)
   digest = buildSequenceDigest(sequence, corpusItems)

3. paireSujet = generateResourcePair({
     type: 'evaluation_sommative',
     context: { ...baseCtx, sequenceDigest: digest, consignes },
     provider,
   })                                              // → A (élève) + B (prof)

4. paireGrille = generateResourcePair({
     type: 'grille_evaluation',
     context: {
       ...baseCtx, sequenceDigest: digest, consignes,
       sujetGenere: paireSujet.professeur.contenu_json,   // ALIGNEMENT
       evaluationFinale: true,
     },
     provider,
   })                                              // → grille (on ne garde que .eleve)

5. Estampiller les ressources à conserver : sequence_id = sequenceId, scope = 'evaluation_finale'
     - paireSujet.professeur, paireSujet.eleve, paireGrille.eleve

6. Persistance ATOMIQUE (une seule transaction) :
     deleteRessourcesBySequenceScope(sequenceId, 'evaluation_finale')  // régénération propre
     saveRessourcePaire(paireSujet)                                    // prof + élève
     saveRessource(paireGrille.eleve)  // élève seul ; voir note ci-dessous

7. Répondre { sujet: { professeur, eleve }, grille: { eleve } }
```

### 6.2 Points d'implémentation

- **Dépendance étape 4 → 3** : séquentiel obligatoire (pas de parallélisation), c'est
  ce qui aligne l'autoévaluation sur le sujet.
- **Persistance de la grille élève seule** : `saveRessourcePaire` attend une paire.
  Comme on ne garde que l'élève (sans prof), prévoir soit une fonction
  `saveRessource(ressource)` simple, soit appeler `saveRessourcePaire({ professeur:
  paireGrille.eleve })` n'est PAS correct (audience). Recommandé : ajouter une petite
  fonction `saveRessource(r: RessourceStructuree)` au repo (un seul upsert) et l'utiliser.
- **Échec partiel** : si l'étape 4 échoue, ne rien persister (la transaction n'est
  ouverte qu'à l'étape 6) → pas d'état incohérent. Renvoyer une erreur 500 claire.
- **Estampillage `scope`/`sequence_id`** : à poser sur les objets `RessourceStructuree`
  avant persistance (les setters de `context.activiteId` ne s'appliquent pas ici ;
  `activite_id` reste `undefined`).

---

## 7. Frontend

### 7.1 Encart « Évaluation finale » (`src/frontend/components/SequenceEditor.tsx`)

Zone existante autour de la ligne 510 (encart rouge). Ajouter, sous le champ texte
`evaluation_finale` (conservé tel quel) :

- **Bouton « Générer l'évaluation finale »** (→ « Régénérer » si des ressources de
  scope `evaluation_finale` existent déjà).
- **Garde-fou** : désactivé tant que la séquence n'est pas sauvegardée en base
  (pas d'`id` persisté). Tooltip : « Sauvegardez la séquence avant de générer
  l'évaluation finale. » Alternative possible : déclencher une sauvegarde implicite
  avant l'appel.
- **Champ « instructions complémentaires »** optionnel (mappé sur `consignes`).
- **État de progression** : l'appel enchaîne 2 (voire 3) générations LLM ; afficher
  un état à deux phases (« Génération du sujet… » → « Génération de l'autoévaluation… »).
  En mode Ollama local c'est long → ne pas laisser l'UI muette.

### 7.2 Affichage du bundle

- Charger au montage / au chargement de séquence via
  `GET /api/resources?sequence_id=<id>&scope=evaluation_finale`.
- Afficher **3 cartes** : « Sujet (élève) », « Sujet (prof) », « Autoévaluation (élève) »,
  chacune avec le `contenu_markdown` rendu et le bouton imprimer (réutiliser le
  mécanisme `window.print` de `ResourcePanel`).
- Régénération : remplace les 3 (suppression + recréation côté serveur, §6).

### 7.3 Config UI à compléter

- `RESOURCE_TYPE_CONFIG` (dans `SequenceEditor.tsx`) : ajouter une entrée
  `evaluation_sommative` (label + chip).
- `SUGGESTED_RESOURCES` : **ne pas** ajouter `evaluation_sommative` (déclenché par le
  bouton séquence, pas suggéré au niveau activité).

---

## 8. Export

À terme, le bundle évaluation finale doit figurer dans l'export « dossier complet »
(cf. chantier export, hors périmètre de cette spec) : liasse élève = sujet élève +
autoévaluation ; dossier prof = sujet prof. Pour le MVP, l'impression carte par carte
(`window.print`) suffit.

---

## 9. Risques & cas limites

| Risque | Traitement |
|--------|-----------|
| Grille non alignée sur le sujet | Génération chaînée : `sujetGenere` injecté dans le prompt grille (§6). |
| Fuite de corrigé/barème en version élève | Tests sur `toStudentVersion` des deux types (sujet + grille). |
| Sortie LLM tronquée (Ollama, gros sujet) | Surveiller `num_ctx` (cf. `architecture.md`) ; sujet + corrigé est la plus grosse sortie. |
| Séquence non persistée | Garde-fou UI (bouton désactivé) ou sauvegarde implicite. |
| Compétence non évaluable à l'écrit | Le prompt demande de le signaler dans `note_prof`, pas d'inventer. |
| Double-clic / régénération | Suppression `scope=evaluation_finale` avant ré-insertion (idempotent). |

---

## 10. Checklist d'implémentation

- [ ] Migration v8 (`sequence_id` + `scope`) dans `db.ts`
- [ ] `RessourceStructureeSchema` : `sequence_id`, `scope`
- [ ] Repo : persistance `sequence_id`/`scope`, `getRessourcesBySequenceScope`, `deleteRessourcesBySequenceScope`, `saveRessource`
- [ ] `GET /api/resources` : support `sequence_id` + `scope`
- [ ] Enum `RessourceTypeSchema` : `evaluation_sommative`
- [ ] Schéma `EvaluationSommativeContenuSchema` + type
- [ ] Définition `evaluation-sommative.ts` (+ renderers prof/élève) + enregistrement registre
- [ ] Extension `GrilleEvaluationContenuSchema` (`questions_autocontrole`, `conseils_revision`)
- [ ] `grille-evaluation.ts` : prompt conditionnel, `toStudentVersion`, renderer section autoévaluation
- [ ] `ResourceGenerationContext` : `sequenceDigest`, `sujetGenere`, `evaluationFinale`
- [ ] `buildSequenceDigest` dans `prompt-context.ts`
- [ ] Endpoint `/api/generate/evaluation` (orchestration chaînée + transaction)
- [ ] Frontend : bouton + garde-fou + champ consignes + 3 cartes + chargement + régénération
- [ ] `RESOURCE_TYPE_CONFIG` : entrée `evaluation_sommative`
- [ ] Tests : anti-fuite (×2), alignement grille/sujet, idempotence régénération
- [ ] Mise à jour `doc/concepts.md` et `doc/resource-types.md` (nouveau type + extension grille)
</content>
</invoke>
