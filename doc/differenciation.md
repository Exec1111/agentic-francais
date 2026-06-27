# Différenciation pédagogique — variantes élève adaptées

> Génération, à partir d'une ressource déjà produite, de **variantes élève** adaptées à
> différents profils d'élèves : allégée, enrichie, dys, allophone.
>
> Voir aussi : [`doc/resource-types.md`](./resource-types.md) (framework des ressources),
> [`doc/concepts.md`](./concepts.md) (glossaire).

---

## Idée directrice

Le framework des ressources produit déjà, en **un seul appel LLM**, un JSON complet d'où il
*dérive* deux versions par filtrage (professeur / élève) via `toStudentVersion` + `toMarkdown`
(cf. [resource-types.md](./resource-types.md)).

La différenciation applique **le même mécanisme sur un troisième axe**, orthogonal à
l'audience : le **profil**.

```
Ressource générée (JSON prof complet)
        │
        ├─→ toMarkdown.professeur      →  Document Prof
        ├─→ toStudentVersion → eleve   →  Document Élève (profil « standard »)
        │
        └─→ generateVariant(profil)    →  re-soumet le JSON au LLM avec les
                                          règles du profil, REVALIDE sur le même
                                          schéma Zod, puis dérive la version élève
                                          →  Variante élève adaptée
```

Une **variante** est une `RessourceStructuree` :
- `audience = 'eleve'`
- `profil ∈ { allegee, enrichie, dys, allophone }` (la version élève de référence a `profil = 'standard'`)
- `derived_from` = id de la ressource **professeur** source

## Les quatre profils

| Profil | Public | Transformation du contenu | Rendu |
|--------|--------|---------------------------|-------|
| `allegee` 🪶 | élèves en difficulté | moins de questions/étapes, consignes simplifiées, étayage (amorces, indices) | standard |
| `enrichie` 🚀 | élèves rapides | questions d'approfondissement, ouverture, exigence accrue, moins d'étayage | standard |
| `dys` 🔤 | troubles dys | phrases courtes, lexique simple, une consigne à la fois, mots-clés en gras | **police OpenDyslexic/Verdana, interlignage 2.0, lettres/mots espacés** |
| `allophone` 🌍 | allophones (FLS) | reformulations explicites, glossaire enrichi, supports guidés | **police Verdana lisible, interlignage 1.9** |

> **Fidélité des textes d'œuvre.** Pour les ressources comportant un texte du corpus
> (ex. `extrait_oeuvre`), le `postProcess` du type **ré-injecte le texte source exact**
> après la génération. Les profils dys/allophone n'altèrent donc **jamais** le texte
> littéraire : seuls consignes, questions, glossaire et notes sont adaptés.

## Architecture technique

### Données partagées (frontend ⇄ backend)

`src/shared/differentiation-profils.ts` — métadonnées UI **sans dépendance serveur** :
`PROFIL_UI` (id, label, description, emoji, indices de rendu `render`), `PROFIL_UI_LIST`,
`getProfilUI()`. Importable côté client (panneau, impression) comme côté serveur.

### Backend

| Fichier | Rôle |
|---------|------|
| `src/backend/resources/differentiation.ts` | `PROFIL_PROMPTS` (règles LLM par profil) + `generateVariant()` (réutilise `buildPrompt`, `validateLLMOutput`, `postProcess`, `toStudentVersion`, `toMarkdown.eleve` du type). |
| `src/app/api/generate/resource/variant/route.ts` | `POST` — reçoit `{ type, profil, baseContent, baseProfId, …contexte }`, génère et persiste la variante (best-effort si `activiteId`). |
| `src/backend/repositories/resource-repo.ts` | colonnes `profil` / `derived_from` aux insertions, `getVariantesByBase()`, suppression en cascade des variantes dans `deleteRessourcePaire`. |

### Modèle de données

Migration **v9** (`ressources_differentiation`) :

```sql
ALTER TABLE ressources ADD COLUMN profil       TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE ressources ADD COLUMN derived_from TEXT REFERENCES ressources(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ressources_derived ON ressources(derived_from);
```

Les variantes portent le même `activite_id` que leur source : elles sont donc chargées par
`getRessourcesByActivite` et **regroupées** sous leur paire côté client (`groupIntoPairs`,
champ `RessourcePaire.variantes`).

### Frontend — `ResourcePanel.tsx`

- Une rangée **« Différenciation »** s'affiche sous le toggle Élève/Professeur pour tout
  type à deux versions : chip **Standard** + un chip par profil **actif** (cf. préférences
  ci-dessous).
- Profil **déjà généré** → chip plein cliquable (affiche la variante) ; sinon chip en
  pointillés qui **génère** la variante (`POST /api/generate/resource/variant`).
- Bouton **« Tout différencier (N) »** : génère **en série** (un appel par profil) toutes
  les variantes manquantes des profils actifs, une fois la version de base validée.
- L'impression (`printResource`) applique automatiquement la **police adaptée** du profil
  (dys/allophone) et suffixe le badge avec le libellé du profil.

### Préférences « classe » par séquence

Un prof n'a pas forcément tous les profils dans sa classe (p. ex. aucun élève dys). La
séquence porte donc une liste de **profils actifs** : `Sequence.differentiation_profils`
(persistée — colonne `sequences.differentiation_profils`, migration **v10**).

- **`undefined`** (défaut, aucune préférence) → différenciation **par niveau** :
  allégée + enrichie (`DEFAULT_ACTIVE_PROFILS`). Dys/allophone sont opt-in.
- **`[]`** → aucun (le prof a tout désactivé).
- liste explicite → seuls ces profils sont proposés.

Réglage : bloc pliable **« Différenciation »** dans l'en-tête de séquence
([`SequenceEditor.tsx`](../src/frontend/components/SequenceEditor.tsx)) — quatre bascules
écrivant le champ via `editor.updateField`. La résolution du défaut est centralisée dans
`resolveActiveProfils()` ([`shared/differentiation-profils.ts`](../src/shared/differentiation-profils.ts)),
et la liste est transmise au panneau via `ResourcePanelContext.activeProfils`.

## Limites assumées (v1)

- **Variante élève uniquement.** Le corrigé professeur reste celui de la version standard ;
  les énoncés adaptés peuvent légèrement en diverger. Une évolution possible serait de
  générer aussi un corrigé prof aligné sur chaque variante.
- **OpenDyslexic** n'est pas embarquée : l'impression la cible si elle est installée sur le
  poste, avec repli sur Verdana/Arial sinon.

## Étendre

- **Nouveau profil** : ajouter une entrée dans `PROFIL_UI` (shared) **et** `PROFIL_PROMPTS`
  (backend) + la valeur dans `DifferentiationProfilSchema` (`src/shared/schemas.ts`). Le test
  `differentiation.test.ts` vérifie que les deux tables restent alignées.
- **Tout type à deux versions** (`category: 'TWO_VERSIONS'`) devient automatiquement
  différenciable, sans code supplémentaire.
