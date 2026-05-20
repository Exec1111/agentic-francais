import { z } from 'zod'

// === Schémas des artefacts pédagogiques ===

export const ActiviteSchema = z.object({
  titre: z.string(),
  type: z.enum(['exercice', 'production_ecrite', 'debat', 'lecture', 'oral', 'evaluation', 'collaboration', 'recherche']),
  duree: z.number().min(5).max(55),
  consigne: z.string(),
  supports: z.array(z.string()).optional(),
  differenciation: z.string().optional(),
})

export const SeanceSchema = z.object({
  numero: z.number(),
  titre: z.string(),
  duree: z.number().default(55),
  objectifs: z.array(z.string()),
  activites: z.array(ActiviteSchema),
  evaluation: z.string().optional(),
})

export const SequenceSchema = z.object({
  id: z.string(),
  titre: z.string(),
  niveau: z.string(),
  theme: z.string(),
  problematique: z.string().optional(),
  objectifs: z.array(z.string()),
  competences: z.array(z.string()),
  seances: z.array(SeanceSchema),
  evaluation_finale: z.string().optional(),
})

export const ReviewSchema = z.object({
  score_qualite: z.number().min(0).max(100),
  problemes: z.array(z.object({
    type: z.enum(['incoherence', 'surcharge', 'repetition', 'objectif_non_couvert', 'progressivite', 'activite_inadaptee']),
    description: z.string(),
    seance_concernee: z.number().optional(),
  })),
  suggestions: z.array(z.string()),
  resume: z.string(),
})

// === Schémas des sorties agents ===

export const OrchestratorOutputSchema = z.object({
  niveau: z.string().default('5e'),
  theme: z.string(),
  nombre_seances: z.coerce.number().min(1).max(15).default(5),
  contraintes: z.array(z.string()).default([]),
  evaluation_finale: z.coerce.boolean().default(true),
  problematique_suggeree: z.string().default(''),
})

export const ArchitectSeanceSchema = z.object({
  numero: z.coerce.number(),
  titre: z.string(),
  duree: z.coerce.number().min(10).max(120).default(55),
  objectifs: z.array(z.string()).default([]),
})

export const ArchitectOutputSchema = z.object({
  titre_sequence: z.string(),
  niveau: z.string(),
  theme: z.string(),
  problematique: z.string().default(''),
  objectifs: z.array(z.string()).min(1),
  competences: z.array(z.string()).min(1),
  seances: z.array(ArchitectSeanceSchema).min(1),
  evaluation_finale: z.string().nullable().default(null),
})

export const GeneratorSeanceOutputSchema = z.object({
  activites: z.array(ActiviteSchema.extend({
    supports: z.array(z.string()).optional().default([]),
    differenciation: z.string().optional(),
  })).min(1),
})

export const ReactDecisionSchema = z.object({
  thought: z.string().default('Réflexion...'),
  action: z.enum(['analyser_demande', 'construire_sequence', 'generer_activites', 'verifier_qualite', 'ameliorer', 'terminer']).default('terminer'),
  action_input: z.string().default(''),
})

// === Types inférés ===

export type Activite = z.infer<typeof ActiviteSchema>
export type Seance = z.infer<typeof SeanceSchema>
export type Sequence = z.infer<typeof SequenceSchema>
export type Review = z.infer<typeof ReviewSchema>
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
