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
│   │   ├── ReviewPanel.tsx      # Panel de relecture qualité
│   │   └── ProviderSwitch.tsx   # Switch Ollama/OpenAI
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

---

*Fait avec ❤️ pour les profs de français*
