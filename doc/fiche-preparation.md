# Spécification — Fiche de préparation de séance (déroulé enseignant)

> Spec d'implémentation. Génère, pour une séance, la **fiche de préparation du
> professeur** : déroulé minuté, gestes professionnels, anticipation des difficultés,
> trace écrite au tableau, matériel, transitions.
> **Statut** : ✅ implémenté (3 juillet 2026) · **Dernière mise à jour** : 3 juillet 2026
> Voir aussi : [`doc/concepts.md`](./concepts.md), [`doc/resource-types.md`](./resource-types.md),
> [`doc/enseignement-explicite.md`](./enseignement-explicite.md), [`doc/evaluation-finale.md`](./evaluation-finale.md)

---

## 1. Objectif & positionnement

Le modèle s'arrête aujourd'hui à `activité → ressource` : ce que font les **élèves**.
Il manque l'objet central que prépare un enseignant : le **déroulé côté professeur**
— qui fait quoi minute par minute, ce que le prof dit et écrit au tableau, comment il
anticipe les difficultés, comment il enchaîne les temps.

### Décision de conception : ressource dérivée, pas extension du modèle cœur

La fiche de préparation est un **document dérivé de la séance complète**, exactement
comme l'évaluation finale est un document dérivé de la séquence complète. On réutilise
donc la même machinerie :

- un **type de ressource** `fiche_preparation` dans le registre, catégorie `TEACHER_ONLY` ;
- un **scope de rattachement** `'seance'` (colonne `ressources.seance_id`), troisième
  niveau après `'activite'` et `'evaluation_finale'` ;
- un **digest de séance** (`buildSeanceDigest`) injecté dans le prompt ;
- un endpoint d'orchestration dédié `POST /api/generate/preparation`.

On n'enrichit **pas** `ActiviteSchema` avec des champs enseignant : cela mélangerait le
design de la séance (élèves) et le script du prof, et la fiche contient des éléments qui
ne vivent dans aucune activité (accueil, transitions entre activités, matériel global).

### Concepts clés

- **Moment ≠ activité.** Le déroulé est une suite de *moments* minutés. Un moment peut
  *recouvrir* une activité (lien `activite_id`) ou être un temps purement enseignant
  (accueil, rituel, transition, passation de consignes).
- **Emboîtement avec l'enseignement explicite.** Si la séance est en mode `explicite`,
  chaque moment porte sa `phase` du canevas 5 phases ; le modelage (« je fais ») est
  précisément un `role_enseignant` scripté. En mode `standard`, `phase` reste `null`.
- **Anti-dérive.** La fiche fige un état de la séance. Un **checksum** du contenu
  pédagogique de la séance est stocké dans la fiche à la génération ; le frontend
  recalcule le checksum courant et affiche un badge « Séance modifiée depuis la
  génération » en cas de divergence (+ bouton Régénérer).

### Hors périmètre (volontairement)

- Édition par blocs du déroulé (réordonner/éditer moment par moment) — la fiche MVP
  s'édite en Markdown comme les documents de l'évaluation finale ; l'éditeur à blocs
  (pattern `*-blocs`) viendra ensuite.
- Version élève (TEACHER_ONLY par nature) et différenciation de la fiche elle-même
  (la fiche *décrit* la différenciation, elle n'est pas différenciée).
- Intégration à l'export « dossier complet » (chantier export).

---

## 2. Prérequis — correction de la persistance (`saveSequence`)

**Bug confirmé** (test sur copie de la base) : `saveSequence`
([`sequence-repo.ts`](../src/backend/repositories/sequence-repo.ts)) supprime toutes
les séances (`DELETE FROM seances WHERE sequence_id = ?`) puis les réinsère. Les FK
`ON DELETE CASCADE` (`activites.seance_id` → `seances.id`, puis `ressources.activite_id`
→ `activites.id`) **détruisent toutes les ressources d'activités de la séquence à
chaque sauvegarde**.

Une fiche rattachée à `seances.id` par FK subirait le même sort. On corrige la cause :

- `saveSequence` passe en **upsert** : `INSERT ... ON CONFLICT(id) DO UPDATE` pour les
  séances et les activités, puis suppression **ciblée** des seules lignes dont l'id ne
  figure plus dans la séquence entrante (la cascade nettoie alors légitimement leurs
  ressources). Les ids client sont stables (`crypto.randomUUID()` assigné par
  `useSequenceEditor` à toute séance/activité qui n'en a pas).
- L'ordre des activités reposait sur le `rowid` (réécrit par la réinsertion) : ajout
  d'une colonne **`activites.position`** renseignée à chaque save ; lecture en
  `ORDER BY position, rowid` (le fallback `rowid` préserve l'ordre des lignes
  antérieures à la migration, toutes à `position = 0`).
- L'ordre des séances repose déjà sur `numero` (réécrit par l'éditeur) : inchangé.

Ce correctif répare au passage la perte silencieuse des ressources d'activités
(générées puis effacées au « Sauvegarder » suivant).

---

## 3. Modèle de données

### 3.1 Migration v12 (`db.ts`)

```ts
{
  version: 12,
  name: 'fiche_preparation_seance_scope',
  sql: `
    -- Rattachement d'une ressource au niveau séance (fiche de préparation).
    ALTER TABLE ressources ADD COLUMN seance_id TEXT REFERENCES seances(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_ressources_seance ON ressources(seance_id);

    -- Ordre des activités persisté explicitement (le rowid n'est plus fiable
    -- une fois saveSequence passé en upsert).
    ALTER TABLE activites ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  `,
},
```

Invariant (code applicatif, comme pour l'évaluation finale) : une ressource a
**exactement un** rattachement — `activite_id` (scope `activite`), `sequence_id`
(scope `evaluation_finale`) ou `seance_id` (scope `seance`).

Le `ON DELETE CASCADE` est désormais **souhaitable** : une séance réellement supprimée
(id absent du save suivant) emporte sa fiche de préparation.

### 3.2 Schémas partagés (`src/shared/schemas.ts`)

- `RessourceTypeSchema` : + `'fiche_preparation'`
- `RessourceStructureeSchema` : + `seance_id?: string`, `scope` étendu à
  `'activite' | 'evaluation_finale' | 'seance'`

### 3.3 Contenu structuré (`src/shared/resource-schemas.ts`)

```ts
export const MomentDidactiqueSchema = z.object({
  ordre: z.number(),
  intitule: z.string(),                       // « Accueil et mise au travail », « Correction collective »…
  duree_min: z.number(),
  phase: PhasePedagogiqueSchema.nullable(),   // canevas explicite — null en mode standard
  activite_id: z.string().nullable(),         // activité recouverte — null pour un temps enseignant pur
  modalite: z.enum(['collectif', 'individuel', 'binomes', 'groupes']),
  role_enseignant: z.string(),                // gestes professionnels : ce que le prof dit/fait, questions à poser
  role_eleves: z.string(),                    // ce que font les élèves pendant ce temps
  trace_ecrite: z.string().nullable(),        // ce qu'on écrit au tableau / dans le cahier
  difficultes_anticipees: z.array(z.object({
    difficulte: z.string(),
    remediation: z.string(),
  })).nullable(),
  materiel: z.array(z.string()).nullable(),
  transition: z.string().nullable(),          // comment on enchaîne vers le moment suivant
})

export const FichePreparationContenuSchema = z.object({
  titre: z.string(),
  place_dans_sequence: z.string(),            // rappel : où en est-on, liens séances précédente/suivante
  objectifs: z.array(z.string()),
  prerequis: z.array(z.string()).nullable(),  // acquis à réactiver en ouverture
  materiel_global: z.array(z.string()).nullable(),
  deroule: z.array(MomentDidactiqueSchema).min(2),
  differenciation: z.string().nullable(),     // ajustements par profil d'élèves
  points_vigilance: z.array(z.string()).nullable(),  // gestion de classe, pièges de la notion
  prolongements: z.string().nullable(),       // devoirs, lien vers la séance suivante
  seance_checksum: z.string().nullable(),     // INJECTÉ PAR LE SYSTÈME (postProcess) — le LLM laisse null
})
```

Convention structured outputs habituelle : `.nullable()` partout, pas de `.optional()`.

### 3.4 Checksum anti-dérive (`src/shared/seance-checksum.ts`)

Module **partagé** (front + back), sans dépendance Node :

```ts
/** FNV-1a 32 bits sur la sérialisation stable du contenu pédagogique de la séance. */
export function computeSeanceChecksum(seance: Seance): string
```

Champs couverts (ceux dont la modification invalide le déroulé) : `titre`, `duree`,
`mode_pedagogique`, `objectifs`, et pour chaque activité dans l'ordre : `titre`, `type`,
`duree`, `consigne`, `phase`. Les champs sans impact sur le déroulé (corpus_status,
ressources…) sont exclus pour éviter les faux positifs.

---

## 4. Type `fiche_preparation`

**Fichier** : `src/backend/resources/types/fiche-preparation.ts` — famille « schéma
dédié », catégorie **`TEACHER_ONLY`**.

- `buildPrompt` : s'appuie sur `ctx.seanceDigest` (§5). Consignes clés :
  1. le déroulé COUVRE la durée de la séance (somme des `duree_min` ≈ durée annoncée,
     tolérance ±5 min) et CHAQUE activité de la séance apparaît dans un moment
     (recopier son `activite_id` exact, fourni dans le digest) ;
  2. intercaler les temps enseignant nécessaires (accueil, passation de consignes,
     transitions, bilan) avec `activite_id: null` ;
  3. en mode explicite, respecter le canevas : chaque moment porte la `phase` de
     l'activité qu'il recouvre ; `role_enseignant` du modelage = script « à voix
     haute » ; en mode standard, `phase: null` partout ;
  4. `trace_ecrite` : s'appuyer sur le contenu des ressources produites (le cours
     nourrit ce qu'on écrit au tableau) — injectées dans le digest ;
  5. `role_enseignant` concret et actionnable (questions à poser, formulations),
     pas des généralités (« l'enseignant accompagne les élèves » est interdit) ;
  6. `difficultes_anticipees` : difficultés PLAUSIBLES et spécifiques à la notion,
     chacune avec sa remédiation ;
  7. `seance_checksum` : laisser `null` (injecté par le système).
- `postProcess` : injecte `seance_checksum` depuis `ctx.seanceChecksum` (garantie par
  code, jamais par le LLM — même principe que le texte corpus d'`extrait_oeuvre`).
- `toMarkdown.professeur` : en-tête (place, objectifs, prérequis, matériel), puis le
  déroulé en **sections par moment** (`## min 0–10 — Intitulé`) avec sous-blocs
  (Rôle enseignant / Élèves / Trace écrite / Difficultés / Transition), puis
  différenciation, vigilance, prolongements. Sections, pas de grand tableau (export PDF).
- `suggestedFor: []` — déclenché par le bouton séance, jamais suggéré au niveau activité.

### Contexte de génération (`registry.ts`, tous champs optionnels)

```ts
/** Digest texte de la séance complète (cf. buildSeanceDigest). */
seanceDigest?: string
/** Checksum du contenu de la séance, injecté par postProcess dans la fiche. */
seanceChecksum?: string
/** Mode pédagogique de la séance (adapte les consignes du prompt). */
modePedagogique?: ModePedagogique
```

---

## 5. `buildSeanceDigest` (`prompt-context.ts`)

À côté de `buildSequenceDigest`. Décrit **une** séance en profondeur :

- contexte séquence : titre, niveau, thème, problématique, position de la séance dans
  la progression (séance précédente / suivante nommées) ;
- séance : numéro, titre, durée totale, objectifs, mode pédagogique (avec rappel du
  canevas 5 phases si `explicite`) ;
- pour chaque activité, **dans l'ordre** : `activite_id` (à recopier dans les moments),
  titre, type, durée, consigne, phase, différenciation éventuelle ;
- **contenu des ressources produites** pour ces activités (version prof, types
  « contenu » : `cours`, `fiche_questions`, `fiche_methode`, `bilan`, `fiche_lecture`,
  `carte_mentale`), plafonné par `RESSOURCE_EXCERPT_CAP` — c'est ce qui nourrit la
  trace écrite et les corrections anticipées ;
- corpus lié aux activités de la séance (titres/auteurs, texte si disponible) ;
- repères du programme du niveau (`getProgrammeReperes`).

Conséquence UX : la fiche est d'autant meilleure que la séance est équipée → le
bouton reste actif sans ressources, mais la génération se déclenche idéalement en
dernier.

---

## 6. Persistance & API

### 6.1 Repository (`resource-repo.ts`)

- `saveRessourcePaire` / `saveRessource` : persister `seance_id` (`?? null`) ;
  `rowToRessource` le relit.
- Nouvelles fonctions (symétriques du scope séquence) :
  ```ts
  export function getRessourcesBySeanceScope(seanceId: string, scope: 'seance'): RessourceStructuree[]
  export function deleteRessourcesBySeanceScope(seanceId: string, scope: 'seance'): number
  ```

### 6.2 `GET /api/resources`

Accepter `?seance_id=…&scope=seance` en plus des formes existantes.

### 6.3 `POST /api/generate/preparation`

**Body** : `{ sequenceId, seanceId, sequence, provider?, consignes? }`
(la séquence complète est transmise comme pour l'évaluation finale — le digest a
besoin de la progression).

```
1. Valider (sequenceId + seanceId requis, SequenceSchema, la séance doit exister).
2. Résoudre les ressources prof des activités de la séance + corpus des activités.
3. digest   = buildSeanceDigest(sequence, seance, corpusItems, activiteResources)
   checksum = computeSeanceChecksum(seance)
4. paire = generateResourcePair({ type: 'fiche_preparation',
     context: { …, seanceDigest, seanceChecksum, modePedagogique, consignes } })
   → TEACHER_ONLY : paire.professeur uniquement.
5. Estampiller : seance_id = seanceId, scope = 'seance', activite_id = undefined.
6. Transaction : deleteRessourcesBySeanceScope(seanceId, 'seance') puis saveRessource.
7. Répondre { fiche: RessourceStructuree }.
```

Garde-fou : la séquence doit être **sauvegardée avant** (FK `seance_id`) — le parent
(HomePage) fait `store.save()` puis appelle l'API, comme pour l'évaluation finale.
⚠️ Ce flux n'est sûr que grâce au correctif §2 (sans lui, chaque save détruirait la
fiche précédente et les ressources d'activités).

---

## 7. Frontend

### 7.1 `FichePreparationSection.tsx`

Composant sur le modèle d'`EvaluationFinaleSection` (un seul document) :

- chargement au montage via `GET /api/resources?seance_id=…&scope=seance` ;
- champ « instructions complémentaires » optionnel + bouton **« Générer la fiche de
  préparation »** (→ « Régénérer » si une fiche existe) ;
- vue du document : aperçu rendu / édition Markdown / sauvegarde (`PATCH
  /api/resources/[id]`) / impression (`printResource`) — même barre d'actions que
  les documents de l'évaluation finale ;
- **badge de dérive** : `computeSeanceChecksum(seanceCourante) !==
  contenu_json.seance_checksum` → bandeau ambre « Séance modifiée depuis la
  génération de la fiche » (le bouton Régénérer est déjà là).

### 7.2 Intégration

- `SeanceBlock` (`SequenceEditor.tsx`) : section repliée « Fiche de préparation »
  sous les activités, rendue uniquement si `onGeneratePreparation` est fourni.
- `HomePage` : `handleGeneratePreparation(seanceIndex, consignes?)` — sauvegarde la
  séquence puis `POST /api/generate/preparation` ; passé à `SequenceEditor` →
  `SeanceBlock` → `FichePreparationSection`.
- `RESOURCE_TYPE_CONFIG` : entrée `fiche_preparation` (label « Fiche de prép. »).
- `SUGGESTED_RESOURCES` : **ne pas** ajouter (déclenchement par bouton séance).

---

## 8. Risques & cas limites

| Risque | Traitement |
|--------|-----------|
| Fiche détruite à chaque save (cascade) | Correctif §2 : saveSequence en upsert, suppression ciblée. |
| Fiche obsolète après édition de la séance | Checksum stocké à la génération + badge de dérive + Régénérer. |
| `activite_id` inventés par le LLM | Ids exacts fournis dans le digest + consigne de recopie ; le rendu Markdown n'en dépend pas (dégradation douce). |
| Minutage incohérent | Consigne « somme ≈ durée séance » ; le renderer affiche les bornes cumulées → l'écart saute aux yeux ; éditable en Markdown. |
| Séance sans activités | `deroule.min(2)` reste satisfiable (moments enseignant purs) ; le digest le signale. |
| Séquence non persistée | Même garde-fou que l'évaluation finale : save préalable par le parent. |
| Régénération | Suppression `scope='seance'` avant ré-insertion (idempotent). |

---

## 9. Checklist d'implémentation

- [x] §2 : `saveSequence` en upsert + suppression ciblée + `activites.position`
- [x] Migration v12 (`seance_id`, index, `position`)
- [x] `RessourceTypeSchema` + `'fiche_preparation'` ; `RessourceStructureeSchema` : `seance_id`, scope `'seance'`
- [x] `FichePreparationContenuSchema` + `MomentDidactiqueSchema`
- [x] `src/shared/seance-checksum.ts` (`computeSeanceChecksum`)
- [x] Définition `fiche-preparation.ts` (+ renderer prof) + enregistrement registre
- [x] `ResourceGenerationContext` : `seanceDigest`, `seanceChecksum`, `modePedagogique`
- [x] `buildSeanceDigest` dans `prompt-context.ts`
- [x] Repo : `seance_id`, `getRessourcesBySeanceScope`, `deleteRessourcesBySeanceScope`
- [x] `GET /api/resources` : support `seance_id` + `scope=seance`
- [x] Endpoint `POST /api/generate/preparation`
- [x] Frontend : `FichePreparationSection` + intégration `SeanceBlock`/`HomePage` + config UI
- [x] Tests : préservation des ressources au re-save, checksum (stabilité/dérive), digest, définition (checksum injecté par postProcess, markdown)
- [x] Mise à jour `doc/concepts.md` et `doc/resource-types.md`
