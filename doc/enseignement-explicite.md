# Enseignement explicite — mode pédagogique par séance

> Génération de séquences dont **certaines séances** suivent le canevas de
> l'**enseignement explicite** (5 phases), choisi séance par séance par l'enseignant
> sur recommandation de l'IA.
>
> Fondé sur la synthèse du CSEN (Pascal Bressoux, juin 2022).
> Voir aussi : [`doc/concepts.md`](./concepts.md) (glossaire).

---

## Idée directrice

L'enseignement explicite est **fortement structuré, du simple au complexe** : l'enseignant
modélise (« je fais »), guide la pratique (« nous faisons ensemble »), puis fait pratiquer
en autonomie (« vous faites seuls »), avec vérification constante de la compréhension.

Il est surtout efficace pour l'**acquisition de notions nouvelles** (élèves novices) et
**moins** pour le réinvestissement ou les tâches « expertes » (*effet de renversement dû à
l'expertise*). Le mode s'applique donc **par séance**, pas globalement :

- L'IA **recommande** un mode pour chaque séance, avec une justification.
- L'enseignant **valide ou ajuste** avant la génération des activités (gate).
- Par défaut, on suit la recommandation de l'IA.

## Le canevas en 5 phases

Une séance en mode `explicite` est découpée en activités, chacune portant sa `phase` :

| Phase | « Voix » | Rôle |
|---|---|---|
| `ouverture` | — | Annonce de l'objectif + réactivation active des acquis |
| `modelage` | Je fais | Démonstration à voix haute, *worked example* + contre-exemple |
| `pratique_guidee` | Nous faisons | Pratique collective étayée, feed-back, vérification de la compréhension |
| `pratique_autonome` | Vous faites seuls | Entraînement individuel pour automatiser |
| `cloture` | — | Synthèse de ce qu'il faut retenir + réinvestissement / devoirs |

## Le flux en deux temps (gate)

Le pipeline de génération est scindé pour insérer une **validation humaine après l'architecte**
(un flux SSE ne peut pas attendre une réponse du client en cours de route) :

```
POST /api/generate/structure   (runStructurePhase)
  orchestrateur → architecte → conseiller pédagogique
  └─→ événement `awaiting_pedagogy` { workflowId, architecture, recommendations }   ⇢ STOP

          ⇣  l'enseignant choisit le mode de chaque séance (composant PedagogyGate)

POST /api/generate/activities  (runGenerationPhase)
  générateur (conscient du mode) → assemblage → reviewer
  └─→ événement `workflow_done` { sequence, review }
```

Le `workflowId` produit par la phase 1 est relayé par le client à la phase 2 pour que la
séquence finale conserve le même identifiant.

> Le flux mono-bloc historique `runWorkflow` (ReAct autonome, `POST /api/generate`) reste
> présent mais n'est plus le parcours principal.

## Agents

- **Conseiller pédagogique** ([`agents/pedagogy-advisor.ts`](../src/backend/agents/pedagogy-advisor.ts)) :
  classe chaque séance (`recommande` + `justification`). Garantit une recommandation par séance.
- **Générateur** ([`agents/generator.ts`](../src/backend/agents/generator.ts)) : reçoit une
  `Map<numero, ModePedagogique>`. En mode `explicite`, le prompt ajoute le
  `EXPLICIT_CANVAS_BLOCK` et chaque activité est taguée de sa `phase` ; en mode `standard`,
  toute phase éventuelle est ignorée.

## Modèle de données

Schémas ([`shared/schemas.ts`](../src/shared/schemas.ts)) :

- `ModePedagogiqueSchema` = `'explicite' | 'standard'`
- `PhasePedagogiqueSchema` = les 5 phases ci-dessus
- `PedagogieRecoSchema` = `{ recommande, justification }`
- `Seance` : `mode_pedagogique?`, `pedagogie_reco?`
- `Activite` : `phase?`

Persistance (migration **v11** dans [`db.ts`](../src/backend/db.ts)) :
`seances.mode_pedagogique`, `seances.pedagogie_reco` (JSON), `activites.phase`.

## UI

- [`PedagogyGate.tsx`](../src/frontend/components/PedagogyGate.tsx) : l'écran de validation
  (liste des séances, badge recommandé/non + justification, toggle Explicite/Standard).
- [`SequenceEditor.tsx`](../src/frontend/components/SequenceEditor.tsx) : badge « Explicite »
  sur l'en-tête de séance, badge de phase sur chaque activité.
- Le **conseiller** apparaît comme 5ᵉ agent dans le pipeline (`AgentCard`, `WorkflowPipeline`).
