# 🎓 Atelier Pédagogique Agentique

**Un OS agentique pour enseignant de français** — Système multi-agents IA de conception automatisée de séquences et séances pédagogiques.

## 🚀 Démarrage rapide

### Prérequis

- Node.js 18+
- **Pour le mode local** : [Ollama](https://ollama.ai) installé avec un modèle (ex: `ollama pull llama3`)
- **Pour le mode production** : Une clé API OpenAI

### Installation

```bash
npm install
```

### Configuration

Modifier `.env.local` :

```env
# "ollama" pour tests locaux, "openai" pour production
LLM_PROVIDER=ollama

# OpenAI (quand LLM_PROVIDER=openai)
OPENAI_API_KEY=sk-votre-clé
OPENAI_MODEL=gpt-4o

# Ollama (quand LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

### Lancement

```bash
npm run dev
```

Ouvrir http://localhost:3000

## 🏗️ Architecture

```
Utilisateur → Interface
                ↓
          Orchestrateur (analyse la demande)
                ↓
          Architecte Pédagogique (structure la séquence)
                ↓
          Générateur d'Activités (enrichit les séances)
                ↓
          Reviewer Qualité (critique constructive)
                ↓
          Export HTML
```

## 🤖 Les 4 Agents

| Agent | Rôle | Couleur |
|-------|------|---------|
| **Orchestrateur** | Analyse la demande, extrait les paramètres | 🟣 Violet |
| **Architecte** | Structure la séquence, planifie les séances | 🔵 Bleu |
| **Générateur** | Crée les activités détaillées | 🟢 Vert |
| **Reviewer** | Vérifie la cohérence pédagogique | 🟡 Ambre |

## 🩹 Correctifs au clic depuis la relecture qualité

Le Reviewer ne se contente plus de lister des remarques en texte libre : chaque
**suggestion est structurée et actionnable**. À côté de chaque suggestion, un
bouton permet d'appliquer le correctif sans quitter le panneau.

**Structure de la review** — les suggestions de correction sont **imbriquées dans
le problème qu'elles résolvent** (1 problème → N suggestions), et un tableau
`suggestions` racine porte les améliorations générales non liées à un problème :

```jsonc
{
  "score_qualite": 85,
  "problemes": [
    {
      "type": "repetition",
      "description": "L'activité d'analyse est répétée en séance 1 et 3.",
      "seance_concernee": 3,
      "suggestions": [ /* correctifs de CE problème */ ]
    }
  ],
  "suggestions": [ /* améliorations générales, non rattachées à un problème */ ],
  "resume": "…"
}
```

**Format d'une suggestion** (qu'elle soit sous un problème ou dans `suggestions`) :

```jsonc
{
  "instruction": "Remplacer l'activité d'analyse par une phase de préparation à l'écriture",
  "action": "remplacer_activite",   // que faire
  "seance_numero": 3,                // OÙ (numéro de séance, ou null = séquence)
  "activite_titre": "Analyse des adjectifs"  // titre EXACT de l'activité visée (ou null)
}
```

**Actions disponibles** (chacune mappée à un accesseur de `useSequenceEditor`) :

| Action | Effet | Génération IA |
|--------|-------|---------------|
| `remplacer_activite` | régénère une activité existante | `/api/generate/activity` |
| `ajouter_activite`   | crée une activité dans une séance | `/api/generate/activity` (mode `ajouter`) |
| `supprimer_activite` | retire une activité | aucune (mutation directe) |
| `modifier_consigne`  | réécrit la consigne d'une activité | `/api/generate/field` |
| `modifier_objectifs` | réécrit les objectifs d'une séance | `/api/generate/field` |
| `aucune`             | conseil transversal, à appliquer à la main | — |

**Principe de conception** : le Reviewer reste un *critique* (il ne modifie rien)
et désigne la cible par identifiants **humain-stables** (numéro de séance + titre
exact). Au clic, la cible est résolue en index, un agent génère le correctif, une
**prévisualisation** s'affiche, puis l'application passe par l'éditeur — donc
**annulable avec `Ctrl+Z`**. Aucun nouvel agent dans le pipeline : on réutilise le
Générateur et les mutations existantes.

> Rétrocompatibilité : les anciennes reviews (suggestions en texte libre) sont
> chargées comme suggestions `aucune` (affichées, non automatisables). Pour les
> rendre actionnables, **relance la relecture** : le bouton « Relancer » du
> panneau (ou « Relecture qualité » dans la barre d'outils si la séquence n'a pas
> encore de review) rejoue le Reviewer sur la séquence courante via `/api/review`
> et produit une review au format structuré.

**Relecture incrémentale & convergence.** Pour éviter de « tourner en rond », la
relance transmet la review précédente (`previousReview`) au Reviewer (température
`0`). Celui-ci **ancre** le score (ne baisse que sur régression concrète, corriger
un problème ne baisse jamais la note), ne **ré-invente** pas de problèmes, et ne
**re-propose** pas une amélioration déjà suggérée. Surtout : **sans problème
détecté, le tableau `suggestions` se vide** → état terminal « ✅ séquence validée »
au lieu d'une amélioration cosmétique sans fin.

## 🔄 Switch IA locale ↔ distante

- **Ollama (local)** : gratuit, rapide, pour tester et itérer
- **OpenAI (distant)** : qualité supérieure, pour les résultats finaux

Le switch se fait en un clic dans l'interface.

## 📁 Structure du projet

```
src/
├── app/
│   ├── api/
│   │   ├── generate/route.ts    # API SSE - pipeline agentique
│   │   ├── generate/activity/route.ts # Régénère/ajoute une activité (correctifs)
│   │   ├── generate/field/route.ts    # Réécrit un champ ciblé (consigne, objectifs)
│   │   ├── review/route.ts      # Relance le Reviewer sur une séquence existante
│   │   ├── logs/route.ts        # Logs des appels LLM
│   │   └── config/route.ts      # Configuration LLM
│   ├── page.tsx                 # Point d'entrée Next.js
│   ├── layout.tsx
│   └── globals.css
├── frontend/
│   ├── components/
│   │   ├── AgentCard.tsx        # Carte visuelle d'un agent
│   │   ├── WorkflowPipeline.tsx # Vue pipeline complète
│   │   ├── SequenceView.tsx     # Affichage de la séquence
│   │   ├── ReviewPanel.tsx      # Relecture qualité + correctifs au clic
│   │   └── ProviderSwitch.tsx   # Switch Ollama/OpenAI
│   ├── hooks/
│   │   ├── useSequenceEditor.ts # Accesseurs de mutation (+ undo/redo)
│   │   └── useSuggestionApply.ts# Résout une suggestion → correctif (preview/commit)
│   └── features/
│       └── home/HomePage.tsx    # Page principale côté client
├── backend/
│   ├── agents/
│   │   ├── orchestrator.ts      # Agent orchestrateur
│   │   ├── architect.ts         # Agent architecte
│   │   ├── generator.ts         # Agent générateur
│   │   └── reviewer.ts          # Agent reviewer
│   ├── llm-provider.ts          # Abstraction LLM
│   └── workflow-engine.ts       # Moteur de workflow SSE
└── shared/
    ├── schemas.ts               # Schémas Zod partagés
    └── utils.ts                 # Utilitaires partagés
```

## 💡 Utilisation

1. Saisir un besoin : *"Prépare une séquence de 5e sur le récit d'aventure avec 5 séances"*
2. Observer les agents travailler en temps réel dans le pipeline
3. Consulter la séquence générée
4. Lire la relecture qualité
5. Exporter en HTML


## 💡 Erreurs et résolutions
[webpack.cache.PackFileCacheStrategy] Restoring pack from C:\Users\julie\CascadeProjects\windsurf-project\agentic-francais\.next\cache\webpack\client-development.pack.gz failed: TypeError: Cannot read properties of undefined (reading 'hasStartTime'

'est un cache webpack corrompu — Next.js le reconstruit automatiquement au démarrage suivant. Aucun impact sur le fonctionnement.

Pour les supprimer, il suffit de vider le cache :

```bash
rm -rf .next/cache
```

---

*Fait avec ❤️ pour les profs de français*
