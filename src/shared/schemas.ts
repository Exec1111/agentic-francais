import { z } from 'zod'

// === Schémas du Corpus littéraire ===

/** Auteur conventionnel des textes originaux générés par l'IA (voir backend/corpus-writer.ts) */
export const IA_AUTEUR = 'Atelier (texte original IA)'

export const CorpusItemSchema = z.object({
  id: z.string(),
  type: z.enum(['extrait', 'oeuvre_complete']),
  auteur: z.string(),
  oeuvre: z.string(),
  titre: z.string(),
  annee_publication: z.number(),
  edition_reference: z.string(),
  pages: z.string().optional(),
  /** Pour un passage : id de l'œuvre source dont il est extrait (provenance + regroupement UI). */
  parent_id: z.string().optional(),
  /** Angle d'étude du passage (« incipit », « ironie », « satire de la guerre »…). */
  angle: z.string().optional(),
  contenu: z.string(),
  checksum: z.string(),
  niveaux: z.array(z.string()),
  genres: z.array(z.string()),
  themes: z.array(z.string()),
  domaine_public: z.boolean().default(false),
  verified: z.boolean().default(false),
  verified_by: z.string().optional(),
  verified_at: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const CorpusQuerySchema = z.object({
  niveaux: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  auteur: z.string().optional(),
  oeuvre: z.string().optional(),
  type: z.enum(['extrait', 'oeuvre_complete']).optional(),
  limit: z.number().default(5),
})

export const CorpusSuggestionSchema = z.object({
  auteur: z.string(),
  oeuvre: z.string(),
  extrait_recommande: z.string(),
  pourquoi: z.string(),
  niveau_difficulte: z.enum(['accessible', 'standard', 'exigeant']),
  // nullable (pas optional) : OpenAI structured outputs exige que TOUS les champs soient dans required
  mots_approximatifs: z.number().nullable(),
  // Métadonnées de l'œuvre suggérée — servent à pré-remplir le dépôt du texte.
  // Nullable (même contrainte structured outputs) ; lues avec un repli ?? [] / année courante.
  genres: z.array(z.string()).nullable(),
  themes: z.array(z.string()).nullable(),
  annee_publication: z.number().nullable(),
})

// Schéma de sortie du générateur de texte original
// (3e source de support : texte inédit écrit par l'IA pour la séquence)
export const GeneratedTextSchema = z.object({
  titre: z.string(),
  genre: z.string(),
  texte: z.string(),
  themes: z.array(z.string()).min(1),
  niveau_difficulte: z.enum(['accessible', 'standard', 'exigeant']),
  notice_pedagogique: z.string(),
})

// Schéma de sortie du LLM-juge de pertinence corpus
export const CorpusRankingItemSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(10),
  raison: z.string(),
})
// OpenAI structured outputs exige un objet à la racine (pas un tableau nu)
export const CorpusRankingSchema = z.object({
  items: z.array(CorpusRankingItemSchema),
})

// === Découpe d'une œuvre en passages exploitables (agent corpus-decoupe) ===
// L'agent renvoie des ANCRES verbatim (pas le texte recopié, pas d'offsets) : le
// serveur localise debut_texte/fin_texte dans l'œuvre et extrait la sous-chaîne
// exacte de la source (garantit la fidélité). Voir resolvePassageSpans.
export const CorpusPassageProposalSchema = z.object({
  titre: z.string(),
  angle: z.string(),
  // Ancres verbatim recopiées du texte source (≈ 8–12 mots chacune).
  debut_texte: z.string(),
  fin_texte: z.string(),
  pourquoi: z.string(),
  // nullable (pas optional) : structured outputs exige tous les champs dans required
  themes: z.array(z.string()).nullable(),
  niveau_difficulte: z.enum(['accessible', 'standard', 'exigeant']).nullable(),
})
export const CorpusDecoupeSchema = z.object({
  passages: z.array(CorpusPassageProposalSchema),
})

export type CorpusItem = z.infer<typeof CorpusItemSchema>
export type CorpusQuery = z.infer<typeof CorpusQuerySchema>
export type CorpusSuggestion = z.infer<typeof CorpusSuggestionSchema>
export type GeneratedText = z.infer<typeof GeneratedTextSchema>
export type CorpusRankingItem = z.infer<typeof CorpusRankingItemSchema>
export type CorpusPassageProposal = z.infer<typeof CorpusPassageProposalSchema>
export type CorpusDecoupe = z.infer<typeof CorpusDecoupeSchema>

// === Schémas des artefacts pédagogiques ===

export const RessourceTypeSchema = z.enum([
  'cours',
  'bilan',
  'extrait_oeuvre',
  'oeuvre_complete',
  'fiche_questions',
  'grille_evaluation',
  'fiche_methode',
  'fiche_lecture',
  'carte_mentale',
  'dictee',
])

export const RessourceAudienceSchema = z.enum(['eleve', 'professeur'])

// Ressource structurée (nouveau système — stockée dans la table `ressources`)
export const RessourceStructureeSchema = z.object({
  id: z.string(),
  activite_id: z.string().optional(),
  type: RessourceTypeSchema,
  audience: RessourceAudienceSchema,
  paired_with: z.string().optional(),   // id de l'autre version de la paire
  contenu_json: z.record(z.unknown()),  // contenu structuré selon le type
  contenu_markdown: z.string(),         // rendu Markdown prêt à afficher / exporter
  created_at: z.string().optional(),
})

// Réponse API : une paire de ressources (prof + élève optionnel)
export const RessourcePaireSchema = z.object({
  professeur: RessourceStructureeSchema,
  eleve: RessourceStructureeSchema.optional(),
})

export const ExerciceFormatSchema = z.enum([
  'texte_a_trous',
  'relier_notions',
  'entourer_reponse',
  'questions_reponses',
  'libre'
])

export const RessourceSchema = z.object({
  id: z.string(),
  titre: z.string(),
  type: RessourceTypeSchema,
  format_exercice: ExerciceFormatSchema.optional(),
  status: z.enum(['empty', 'generating', 'ready', 'error']).default('empty'),
  contenu: z.string().default(''),
  description: z.string().optional(),
})

export const ActiviteSchema = z.object({
  id: z.string().optional(),
  seanceId: z.string().optional(),
  titre: z.string(),
  type: z.enum(['exercice', 'production_ecrite', 'debat', 'lecture', 'oral', 'evaluation', 'collaboration', 'recherche']),
  duree: z.number().min(5).max(55),
  consigne: z.string(),
  supports: z.array(z.string()).optional(),
  differenciation: z.string().optional(),
  ressources: z.array(RessourceSchema).optional().default([]),
  /** @deprecated Utiliser corpus_refs — conservé pour la rétrocompatibilité à la lecture. */
  corpus_ref: z.string().optional(),
  corpus_refs: z.array(z.string()).default([]),
  corpus_status: z.enum(['non_requis', 'trouve', 'manquant', 'manquant_sans_suggestion']).optional(),
  corpus_suggestion: CorpusSuggestionSchema.optional(),
})

export const SeanceSchema = z.object({
  id: z.string().optional(),
  sequenceId: z.string().optional(),
  numero: z.number(),
  titre: z.string(),
  duree: z.number().default(55),
  objectifs: z.array(z.string()),
  activites: z.array(ActiviteSchema),
  evaluation: z.string().optional(),
  ressources: z.array(RessourceSchema).optional().default([]),
})

export const SequenceSchema = z.object({
  id: z.string(),
  titre: z.string(),
  niveau: z.string(),
  theme: z.string(),
  problematique: z.string().optional(),
  objectifs: z.array(z.string()),
  competences: z.array(z.string()),
  corpus_refs: z.array(z.string()).default([]),
  seances: z.array(SeanceSchema),
  evaluation_finale: z.string().optional(),
  ressources: z.array(RessourceSchema).optional().default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

// Actions qu'un correctif au clic peut appliquer. Chaque valeur correspond à une
// capacité de l'éditeur (useSequenceEditor) :
//  - remplacer_activite  → /api/generate/activity (LLM) puis replaceActivite
//  - ajouter_activite     → /api/generate/activity en mode "ajouter" puis addActivite
//  - supprimer_activite   → removeActivite (sans LLM)
//  - modifier_consigne    → /api/generate/field (LLM, champ ciblé) puis updateField
//  - modifier_objectifs   → /api/generate/field (LLM, champ ciblé) puis updateField
//  - aucune               → conseil transversal, non rattaché à une mutation précise
export const SuggestionActionSchema = z.enum([
  'remplacer_activite',
  'ajouter_activite',
  'supprimer_activite',
  'modifier_consigne',
  'modifier_objectifs',
  'aucune',
])

// Suggestion structurée et actionnable produite par le reviewer.
// La cible est exprimée par identifiants HUMAIN-STABLES (numéro de séance + titre
// exact d'activité), résolus en index au moment de l'application côté éditeur.
// nullable (et non optional) : exigé par les Structured Outputs OpenAI.
export const ActionableSuggestionSchema = z.object({
  instruction: z.string(),
  action: SuggestionActionSchema,
  seance_numero: z.number().nullable(),
  activite_titre: z.string().nullable(),
})

// Un problème détecté, accompagné des suggestions qui le corrigent (0..N).
export const ProblemeSchema = z.object({
  type: z.enum(['incoherence', 'surcharge', 'repetition', 'objectif_non_couvert', 'progressivite', 'activite_inadaptee']),
  description: z.string(),
  seance_concernee: z.number().nullable(),
  suggestions: z.array(ActionableSuggestionSchema),
})

export const ReviewSchema = z.object({
  score_qualite: z.number().min(0).max(100),
  problemes: z.array(ProblemeSchema),
  // Suggestions d'amélioration GÉNÉRALES, non rattachées à un problème détecté.
  suggestions: z.array(ActionableSuggestionSchema),
  resume: z.string(),
})

// === Schémas des sorties agents ===

export const OrchestratorOutputSchema = z.object({
  niveau: z.string(),
  theme: z.string(),
  nombre_seances: z.coerce.number().min(1).max(15),
  contraintes: z.array(z.string()),
  evaluation_finale: z.boolean(),
  problematique_suggeree: z.string(),
})

export const ArchitectSeanceSchema = z.object({
  numero: z.coerce.number(),
  titre: z.string(),
  duree: z.coerce.number().min(10).max(120),
  objectifs: z.array(z.string()),
})

export const ArchitectOutputSchema = z.object({
  titre_sequence: z.string(),
  niveau: z.string(),
  theme: z.string(),
  problematique: z.string(),
  objectifs: z.array(z.string()).min(1),
  competences: z.array(z.string()).min(1),
  seances: z.array(ArchitectSeanceSchema).min(1),
  evaluation_finale: z.string().nullable(),
})

export const GeneratorSeanceOutputSchema = z.object({
  activites: z.array(z.object({
    titre: z.string(),
    type: z.enum(['exercice', 'production_ecrite', 'debat', 'lecture', 'oral', 'evaluation', 'collaboration', 'recherche']),
    duree: z.number().min(5).max(55),
    consigne: z.string(),
    supports: z.array(z.string()),
    differenciation: z.string().nullable(),
  })).min(1),
})

export const ReactDecisionSchema = z.object({
  thought: z.string(),
  action: z.enum(['analyser_demande', 'construire_sequence', 'generer_activites', 'verifier_qualite', 'ameliorer', 'terminer']),
  action_input: z.string(),
})

// === Types inférés ===

export type Ressource = z.infer<typeof RessourceSchema>
export type RessourceType = z.infer<typeof RessourceTypeSchema>
export type RessourceAudience = z.infer<typeof RessourceAudienceSchema>
export type RessourceStructuree = z.infer<typeof RessourceStructureeSchema>
export type RessourcePaire = z.infer<typeof RessourcePaireSchema>
export type ExerciceFormat = z.infer<typeof ExerciceFormatSchema>
export type Activite = z.infer<typeof ActiviteSchema>
export type Seance = z.infer<typeof SeanceSchema>
export type Sequence = z.infer<typeof SequenceSchema>
export type Review = z.infer<typeof ReviewSchema>
export type SuggestionAction = z.infer<typeof SuggestionActionSchema>
export type ActionableSuggestion = z.infer<typeof ActionableSuggestionSchema>
export type Probleme = z.infer<typeof ProblemeSchema>
export type OrchestratorOutput = z.infer<typeof OrchestratorOutputSchema>
export type ArchitectOutput = z.infer<typeof ArchitectOutputSchema>
export type ReactDecision = z.infer<typeof ReactDecisionSchema>

// === Schémas du workflow ===

export const AgentStepSchema = z.object({
  agent: z.enum(['orchestrateur', 'architecte', 'generateur', 'reviewer']),
  status: z.enum(['idle', 'running', 'done', 'error']),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  input: z.any().optional(),
  output: z.any().optional(),
  error: z.string().optional(),
  logs: z.array(z.string()).default([]),
})

export const WorkflowStateSchema = z.object({
  id: z.string(),
  demande: z.string(),
  status: z.enum(['idle', 'running', 'completed', 'error']),
  currentAgent: z.enum(['orchestrateur', 'architecte', 'generateur', 'reviewer']).nullable(),
  steps: z.array(AgentStepSchema),
  sequence: SequenceSchema.nullable(),
  review: ReviewSchema.nullable(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
})

export type AgentStep = z.infer<typeof AgentStepSchema>
export type WorkflowState = z.infer<typeof WorkflowStateSchema>
export type AgentName = 'orchestrateur' | 'architecte' | 'generateur' | 'reviewer'
