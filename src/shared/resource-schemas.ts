/**
 * Schémas Zod pour le contenu structuré de chaque type de ressource.
 *
 * Conventions :
 * - Les champs marqués "// PROF ONLY" sont retirés dans toStudentVersion()
 * - Utiliser .nullable() (pas .optional()) pour la compatibilité OpenAI Structured Outputs
 *   (tous les champs doivent être dans required — null signifie "absent")
 * - Voir doc/resource-types.md pour le guide d'ajout d'un nouveau type
 */

import { z } from 'zod'
import { ExerciceFormatSchema } from './schemas'

// ═══════════════════════════════════════════════════════════════════════════════
// EXERCICE
// ═══════════════════════════════════════════════════════════════════════════════

export const ExerciceItemSchema = z.object({
  enonce: z.string().describe("Énoncé ou question de l'item"),
  contenu_eleve: z.string().describe('Ce que voit l\'élève : texte avec [__________], propositions, etc.'),
  correction: z.string().nullable().describe('PROF ONLY — réponse correcte complète'),
  justification: z.string().nullable().describe('PROF ONLY — note pédagogique sur la règle ou le raisonnement'),
  difficulte: z.enum(['facile', 'moyen', 'difficile']),
})

export const ExerciceContenuSchema = z.object({
  format: ExerciceFormatSchema,
  objectif: z.string().describe('Compétence visée, ex: "Identifier les pronoms relatifs"'),
  consigne_generale: z.string().describe('Consigne adressée à l\'élève'),
  introduction: z.string().nullable().describe('Mise en contexte optionnelle, null si inutile'),
  items: z.array(ExerciceItemSchema).min(2).max(12),
  mot_banque: z.array(z.string()).nullable().describe('Boîte à mots pour texte_a_trous, null pour les autres formats'),
  conseil_correction: z.string().nullable().describe('PROF ONLY — conseils pour la correction en classe'),
  duree_estimee: z.number().nullable().describe('Durée estimée en minutes'),
})

export type ExerciceContenu = z.infer<typeof ExerciceContenuSchema>
export type ExerciceItem = z.infer<typeof ExerciceItemSchema>

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRAIT D'ŒUVRE
// ═══════════════════════════════════════════════════════════════════════════════

export const ExtraitQuestionSchema = z.object({
  enonce: z.string().describe('Question posée à l\'élève sur le texte'),
  reponse_attendue: z.string().nullable().describe('PROF ONLY — éléments de réponse attendus'),
  elements_analyse: z.string().nullable().describe('PROF ONLY — figures de style, procédés, champ lexical'),
})

export const NoteBdpSchema = z.object({
  mot: z.string(),
  definition: z.string().describe('Définition courte adaptée au niveau scolaire'),
})

export const ExtraitOeuvreContenuSchema = z.object({
  auteur: z.string(),
  oeuvre: z.string(),
  edition_reference: z.string(),
  pages: z.string().nullable(),
  introduction: z.string().describe('2-3 phrases de présentation contextuelle (sera affiché en italique)'),
  texte: z.string().describe('Le texte exact, avec numérotation des lignes/vers tous les 5 : [5], [10], etc.'),
  notes_bas_de_page: z.array(NoteBdpSchema).nullable().describe('Glossaire 4-8 termes difficiles, null si aucun'),
  questions: z.array(ExtraitQuestionSchema).min(2).max(6),
  note_prof: z.string().nullable().describe('PROF ONLY — points littéraires clés, comment conduire la lecture'),
})

export type ExtraitOeuvreContenu = z.infer<typeof ExtraitOeuvreContenuSchema>

// ═══════════════════════════════════════════════════════════════════════════════
// COURS
// ═══════════════════════════════════════════════════════════════════════════════

export const CoursSectionSchema = z.object({
  titre: z.string(),
  contenu: z.string().describe('Corps de la section (Markdown : listes, gras, blocs OK)'),
  definition: z.object({
    terme: z.string(),
    definition: z.string(),
  }).nullable().describe('Définition encadrée si la section introduit un terme clé, null sinon'),
  a_retenir: z.string().nullable().describe('Phrase ou formule à mémoriser absolument'),
  note_prof: z.string().nullable().describe('PROF ONLY — erreurs fréquentes, anecdotes, timing'),
})

export const CoursContenuSchema = z.object({
  objectif: z.string(),
  sections: z.array(CoursSectionSchema).min(1).max(8),
  lexique: z.array(z.object({
    terme: z.string(),
    definition: z.string(),
  })).nullable().describe('Mini-lexique final, null si pas nécessaire'),
  note_prof_globale: z.string().nullable().describe('PROF ONLY — comment utiliser ce cours, durée, prérequis'),
})

export type CoursContenu = z.infer<typeof CoursContenuSchema>

// ═══════════════════════════════════════════════════════════════════════════════
// BILAN
// ═══════════════════════════════════════════════════════════════════════════════

export const BilanCheckItemSchema = z.object({
  competence: z.string().describe('Formulation "Je sais..." ou "Je suis capable de..."'),
  reponse_correcte: z.string().nullable().describe('PROF ONLY — exemple de réalisation correcte / critères'),
  remediation: z.string().nullable().describe('PROF ONLY — activité ou ressource de remédiation suggérée'),
})

export const BilanContenuSchema = z.object({
  objectif: z.string(),
  notions_cles: z.array(z.object({
    notion: z.string(),
    explication: z.string(),
  })).min(1).max(8),
  checklist: z.array(BilanCheckItemSchema).min(2).max(10),
  mini_lexique: z.array(z.object({
    terme: z.string(),
    definition: z.string(),
  })).nullable(),
  conseil_prof: z.string().nullable().describe('PROF ONLY — comment utiliser ce bilan (auto-éval, correction...)'),
})

export type BilanContenu = z.infer<typeof BilanContenuSchema>

// ═══════════════════════════════════════════════════════════════════════════════
// DICTÉE — TEACHER ONLY (pas de version élève, l'élève écrit sur feuille)
// ═══════════════════════════════════════════════════════════════════════════════

export const DicteeContenuSchema = z.object({
  titre: z.string(),
  niveau: z.string(),
  texte_complet: z.string().describe('Texte intégral à dicter, avec ponctuation'),
  points_de_vigilance: z.array(z.string()).describe('Difficultés orthographiques/grammaticales spécifiques'),
  consignes_passation: z.string().describe('Instructions de lecture à voix haute pour le professeur'),
  variante_allegee: z.string().nullable().describe('Version simplifiée pour différenciation, null si non nécessaire'),
  variante_challenge: z.string().nullable().describe('Version enrichie pour élèves avancés, null si non nécessaire'),
  correction_type: z.string().nullable().describe('Erreurs typiques à anticiper + barème suggéré'),
})

export type DicteeContenu = z.infer<typeof DicteeContenuSchema>

// ═══════════════════════════════════════════════════════════════════════════════
// GRILLE D'ÉVALUATION
// ═══════════════════════════════════════════════════════════════════════════════

export const GrilleNiveauSchema = z.object({
  label: z.string().describe('Ex : "Maîtrisé", "En cours d\'acquisition", "Non atteint"'),
  description: z.string().describe('Description précise de ce qui correspond à ce niveau'),
  points: z.number().nullable().describe('PROF ONLY — points attribués à ce niveau, null dans version élève'),
})

export const GrilleCompetenceSchema = z.object({
  intitule: z.string(),
  description: z.string(),
  niveaux: z.array(GrilleNiveauSchema).min(2).max(4),
})

export const GrilleEvaluationContenuSchema = z.object({
  objectif: z.string(),
  competences: z.array(GrilleCompetenceSchema).min(1).max(8),
  total_points: z.number().nullable().describe('PROF ONLY — total des points possibles'),
  bareme: z.string().nullable().describe('PROF ONLY — table de conversion points → note /20'),
  note_prof: z.string().nullable().describe('PROF ONLY — comment présenter la grille aux élèves'),
})

export type GrilleEvaluationContenu = z.infer<typeof GrilleEvaluationContenuSchema>

// ═══════════════════════════════════════════════════════════════════════════════
// FICHE MÉTHODE
// ═══════════════════════════════════════════════════════════════════════════════

export const FicheMethodeEtapeSchema = z.object({
  numero: z.number(),
  titre: z.string(),
  description: z.string(),
  exemple: z.string().nullable(),
  note_prof: z.string().nullable().describe('PROF ONLY — comment introduire cette étape en classe'),
})

export const FicheMethodeContenuSchema = z.object({
  objectif: z.string(),
  etapes: z.array(FicheMethodeEtapeSchema).min(2).max(8),
  exemple_complet: z.string().nullable().describe('Exemple d\'application complète de la méthode'),
  pieges_courants: z.array(z.string()).nullable().describe('Erreurs fréquentes à éviter'),
  note_prof_globale: z.string().nullable().describe('PROF ONLY — difficultés fréquentes chez les élèves'),
})

export type FicheMethodeContenu = z.infer<typeof FicheMethodeContenuSchema>

// ═══════════════════════════════════════════════════════════════════════════════
// FICHE DE LECTURE
// ═══════════════════════════════════════════════════════════════════════════════

export const FicheLectureQuestionSchema = z.object({
  enonce: z.string(),
  espace_reponse: z.number().nullable().describe('Nombre de lignes vides dans la version élève'),
  reponse_attendue: z.string().nullable().describe('PROF ONLY — éléments de réponse'),
})

export const FicheLectureSectionSchema = z.object({
  titre: z.string().describe('Ex : "Résumé", "Les personnages", "Les thèmes"'),
  questions: z.array(FicheLectureQuestionSchema).min(1),
})

export const FicheLectureContenuSchema = z.object({
  oeuvre: z.string(),
  auteur: z.string(),
  sections: z.array(FicheLectureSectionSchema).min(2).max(6),
  note_prof: z.string().nullable().describe("PROF ONLY — points d'interprétation clés, pistes de discussion"),
})

export type FicheLectureContenu = z.infer<typeof FicheLectureContenuSchema>

// ═══════════════════════════════════════════════════════════════════════════════
// CARTE MENTALE
// ═══════════════════════════════════════════════════════════════════════════════

export const CarteMentaleNoeudSchema = z.object({
  label: z.string(),
  detail: z.string().nullable(),
  a_completer: z.boolean().describe('true = ce nœud apparaît vide dans la version élève'),
})

export const CarteMentaleBrancheSchema = z.object({
  label: z.string(),
  sous_branches: z.array(CarteMentaleNoeudSchema).min(1),
})

export const CarteMentaleContenuSchema = z.object({
  theme_central: z.string(),
  objectif: z.string(),
  branches: z.array(CarteMentaleBrancheSchema).min(2).max(8),
  note_prof: z.string().nullable(),
})

export type CarteMentaleContenu = z.infer<typeof CarteMentaleContenuSchema>
