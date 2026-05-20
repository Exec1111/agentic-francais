# Architecture du Moteur Agentique

> Documentation technique du système multi-agents pédagogique.  
> **Dernière mise à jour** : 20 mai 2025

---

## Vue d'ensemble

Le système est un **moteur agentique** qui génère des séquences pédagogiques de cours de français via un ensemble d'agents LLM coordonnés par le pattern **ReAct** (Reasoning + Acting).

```
┌─────────────────────────────────────────────────────────────────┐
│                        Workflow Engine                            │
│                    (pattern ReAct - 8 steps max)                  │
│                                                                   │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│   │ Orchestrateur│───▶│  Architecte │───▶│  Générateur │         │
│   │   (ReAct)   │    │ Pédagogique │    │  d'Activités│         │
│   └─────────────┘    └─────────────┘    └──────┬──────┘         │
│         ▲                                       │                │
│         │            ┌─────────────┐            │                │
│         └────────────│   Reviewer   │◀───────────┘                │
│          (feedback)  │   Qualité    │                             │
│                      └─────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Structure des fichiers

```
src/
├── backend/
│   ├── llm-provider.ts      # Abstraction LLM (OpenAI + Ollama)
│   ├── validation.ts        # Validation Zod + retry
│   ├── workflow-engine.ts   # Moteur ReAct (orchestration dynamique)
│   └── agents/
│       ├── orchestrator.ts  # Extraction des paramètres
│       ├── architect.ts     # Structure de la séquence
│       ├── generator.ts     # Activités par séance
│       └── reviewer.ts      # Vérification qualité
├── shared/
│   ├── schemas.ts           # Schémas Zod (contrats de données)
│   └── utils.ts             # Utilitaires partagés
└── frontend/
    ├── hooks/
    │   └── useSequenceEditor.ts  # Store éditeur avec undo/redo
    ├── components/
    │   ├── EditableText.tsx       # Champ texte inline éditable
    │   ├── EditableList.tsx       # Liste éditable (add/edit/remove)
    │   ├── SequenceEditor.tsx     # Éditeur complet de séquence
    │   └── ...                    # Autres composants UI
    └── features/
        └── home/HomePage.tsx      # Page principale
```

---

## Pattern ReAct

Le workflow fonctionne en **boucle dynamique** (max 8 itérations) :

```
Pour chaque étape :
  1. THOUGHT  → L'orchestrateur raisonne sur l'état actuel
  2. ACTION   → Il choisit une action parmi les disponibles
  3. EXECUTION → Le moteur exécute l'action (appel agent)
  4. OBSERVATION → Le résultat est renvoyé à l'orchestrateur
```

### Actions disponibles

| Action | Agent appelé | Description |
|--------|-------------|-------------|
| `analyser_demande` | Orchestrateur | Extraire niveau, thème, contraintes |
| `construire_sequence` | Architecte | Structurer titre, objectifs, séances |
| `generer_activites` | Générateur | Créer 2-4 activités par séance |
| `verifier_qualite` | Reviewer | Évaluer cohérence (score /100) |
| `ameliorer` | Générateur | Re-générer après critique |
| `terminer` | — | Fin du workflow |

### Règles de l'orchestrateur

- Commence toujours par `analyser_demande`
- Score < 60 → `ameliorer` obligatoire
- Score 60-80 → amélioration optionnelle
- Score ≥ 80 → `terminer`
- Pas 3x la même action de suite

---

## Structured Outputs

### Principe

La structure JSON des sorties n'est **pas dictée par le prompt** mais **imposée au niveau du décodage** par les providers LLM :

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Schéma Zod  │────▶│ zod-to-json-schema │────▶│ Provider LLM   │
│ (schemas.ts) │     │                    │     │ (contrainte au │
└──────────────┘     └──────────────────┘     │  décodage)     │
                                               └────────────────┘
```

- **OpenAI** : `response_format: { type: "json_schema", json_schema: { schema, strict: true } }`
- **Ollama ≥0.5** : `format: <json_schema_object>` (contrainte grammaticale)

### Avantage

Le prompt se concentre uniquement sur les **instructions métier** (quoi faire), pas sur le format (comment structurer la sortie). La conformité est garantie mécaniquement.

---

## Validation (filet de sécurité)

Fichier : `src/backend/validation.ts`

Même avec les Structured Outputs, une validation Zod est appliquée après chaque appel. Stratégie en cascade :

```
1. Parse JSON brut (réparation trailing commas, commentaires)
2. Validation Zod (coercion: "5" → 5, defaults appliqués)
3. Si échec → Retry avec feedback d'erreur au LLM
4. Si re-échec → throw Error avec détails Zod
```

### Signature

```typescript
async function validateLLMOutput<T extends z.ZodTypeAny>(
  opts: { schema: T; raw: string; context: string; llm?; messages?; options?; maxRetries?; onLog? }
): Promise<z.infer<T>>
```

### Réparations JSON automatiques (`extractJSON`)

- Suppression des blocs ` ```json ``` `
- Suppression du texte avant/après le JSON
- Réparation des trailing commas (`,]` → `]`, `,}` → `}`)
- Suppression des commentaires `//` et `/* */`
- Troncature progressive (cherche le dernier JSON valide)

---

## Schémas de données

Fichier : `src/shared/schemas.ts`

### Sorties agents

| Schéma | Agent | Champs principaux |
|--------|-------|-------------------|
| `OrchestratorOutputSchema` | Orchestrateur | `niveau`, `theme`, `nombre_seances`, `contraintes`, `evaluation_finale`, `problematique_suggeree` |
| `ArchitectOutputSchema` | Architecte | `titre_sequence`, `objectifs[]`, `competences[]`, `seances[]` |
| `GeneratorSeanceOutputSchema` | Générateur | `activites[]` (par séance) |
| `ReviewSchema` | Reviewer | `score_qualite`, `problemes[]`, `suggestions[]`, `resume` |
| `ReactDecisionSchema` | Workflow | `thought`, `action` (enum), `action_input` |

### Artefacts finaux

| Schéma | Description |
|--------|-------------|
| `ActiviteSchema` | Une activité (titre, type, durée, consigne, supports) |
| `SeanceSchema` | Une séance (numéro, titre, objectifs, activités) |
| `SequenceSchema` | Séquence complète (titre, niveau, séances, évaluation) |
| `ReviewSchema` | Critique qualité (score, problèmes, suggestions) |

### Types d'activités (enum)

`exercice` · `production_ecrite` · `debat` · `lecture` · `oral` · `evaluation` · `collaboration` · `recherche`

### Types de problèmes (enum)

`incoherence` · `surcharge` · `repetition` · `objectif_non_couvert` · `progressivite` · `activite_inadaptee`

---

## Providers LLM

Fichier : `src/backend/llm-provider.ts`

### Interface

```typescript
interface LLMProvider {
  name: string
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse>
}

interface ChatOptions {
  temperature?: number
  json?: boolean                // Mode JSON simple (legacy)
  schema?: z.ZodTypeAny         // Structured Outputs (recommandé)
  schemaName?: string           // Nom pour OpenAI
}
```

### Providers supportés

| Provider | Classe | Modèle par défaut | Structured Outputs |
|----------|--------|-------------------|-------------------|
| OpenAI | `OpenAIProvider` | `gpt-4o` | `response_format.json_schema` + `strict: true` |
| Ollama | `OllamaProvider` | `llama3` | `format: <json_schema>` |

### Configuration (`.env.local`)

```env
LLM_PROVIDER=ollama          # ou "openai"
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:latest
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

---

## Logging

Chaque appel LLM est instrumenté avec :

- **Console** : logs colorés avec entrées/sorties tronquées, durée, erreurs
- **Mémoire** : stockage des 50 derniers appels (accessible via `/api/logs`)
- **UI** : Panel "Logs LLM" dans le header (drawer latéral)

### Structure d'un log

```typescript
interface LLMCallLog {
  id: number
  timestamp: string
  provider: string            // ex: "ollama/gemma4:latest"
  messages: LLMMessage[]      // entrées envoyées
  options?: ChatOptions
  response?: string           // sortie reçue
  error?: string
  durationMs: number
}
```

---

## Communication Frontend ↔ Backend

### API SSE (`POST /api/generate`)

Le workflow émet des événements via **Server-Sent Events** :

```typescript
type WorkflowEvent =
  | { type: 'workflow_start'; workflowId; demande }
  | { type: 'react_thought'; step; thought }
  | { type: 'react_action'; step; action; input }
  | { type: 'react_observation'; step; observation }
  | { type: 'agent_start'; agent }
  | { type: 'agent_log'; agent; message }
  | { type: 'agent_done'; agent; output }
  | { type: 'agent_error'; agent; error }
  | { type: 'workflow_done'; sequence; review }
  | { type: 'workflow_error'; error }
```

### API Logs (`GET /api/logs`, `DELETE /api/logs`)

Accès aux logs LLM en mémoire (lecture / vidage).

---

## Flux de données complet

```
Utilisateur
    │
    ▼ "Prépare une séquence de 5e sur le récit d'aventure"
┌───────────────────────────────────────────────┐
│ POST /api/generate                             │
│   → runWorkflow(demande, provider)            │
│                                                │
│ Step 1: THOUGHT → "analyser la demande"       │
│         ACTION  → analyser_demande             │
│         → OrchestratorOutputSchema             │
│         OBSERVATION → "Niveau: 5e, Thème: ..." │
│                                                │
│ Step 2: THOUGHT → "structurer la séquence"    │
│         ACTION  → construire_sequence          │
│         → ArchitectOutputSchema                │
│         OBSERVATION → "5 séances planifiées"   │
│                                                │
│ Step 3: THOUGHT → "créer les activités"       │
│         ACTION  → generer_activites            │
│         → GeneratorSeanceOutputSchema (x5)     │
│         OBSERVATION → "15 activités générées"  │
│                                                │
│ Step 4: THOUGHT → "vérifier la qualité"       │
│         ACTION  → verifier_qualite             │
│         → ReviewSchema                         │
│         OBSERVATION → "Score: 85/100"          │
│                                                │
│ Step 5: THOUGHT → "score ≥ 80, on termine"    │
│         ACTION  → terminer                     │
│         → workflow_done { sequence, review }    │
└───────────────────────────────────────────────┘
    │
    ▼ SSE events → UI temps réel
```

---

## Éditeur de séquence

### Architecture

L'éditeur permet de modifier une séquence générée à tous les niveaux de granularité :

```
Séquence (titre, niveau, thème, problématique, objectifs, compétences)
├── Séance 1 (titre, durée, objectifs)
│   ├── Activité 1 (titre, type, durée, consigne, supports)
│   └── Activité 2
├── Séance 2
│   └── ...
└── Évaluation finale
```

### Composants

| Composant | Rôle |
|-----------|------|
| `useSequenceEditor` | Store centralisé (useReducer) avec historique undo/redo (30 niveaux) |
| `EditableText` | Champ texte inline : click-to-edit, Enter pour sauver, Escape pour annuler |
| `EditableList` | Liste éditable : modification, ajout, suppression d'éléments |
| `SequenceEditor` | Assemblage complet avec séances dépliables et activités |

### Actions du store

| Action | Description |
|--------|-------------|
| `SET_SEQUENCE` | Initialise la séquence (reset undo) |
| `UPDATE_FIELD` | Modifie un champ à n'importe quel niveau |
| `ADD/REMOVE/MOVE_SEANCE` | Gestion des séances (renumérotation auto) |
| `ADD/REMOVE/MOVE_ACTIVITE` | Gestion des activités dans une séance |
| `ADD/REMOVE/UPDATE_LIST_ITEM` | Gestion des listes (objectifs, compétences, supports) |
| `UNDO` / `REDO` | Navigation dans l'historique |

### Raccourcis clavier

- **Ctrl+Z** : Annuler
- **Ctrl+Y** ou **Ctrl+Shift+Z** : Rétablir
- **Enter** : Valider l'édition en cours
- **Escape** : Annuler l'édition en cours

---

## Ajout d'un nouvel agent

1. **Créer le schéma** dans `src/shared/schemas.ts`
2. **Créer l'agent** dans `src/backend/agents/nouvel_agent.ts`
3. **Ajouter l'action** dans `ReactDecisionSchema.action` (enum)
4. **Ajouter le case** dans le `switch(action)` de `workflow-engine.ts`
5. **Mettre à jour cette doc** (`doc/architecture.md`)

---

## Dépendances clés

| Package | Rôle |
|---------|------|
| `zod` | Schémas + validation runtime |
| `zod-to-json-schema` | Conversion Zod → JSON Schema pour Structured Outputs |
| `openai` | Client OpenAI API |
| `uuid` | Génération d'IDs workflow |
| `framer-motion` | Animations UI |
| `lucide-react` | Icônes |
