/**
 * Différenciation pédagogique : génération de VARIANTES élève adaptées à partir
 * d'une ressource déjà générée.
 *
 * Principe (réutilise intégralement le pipeline de génération) :
 *   1. On part du JSON COMPLET (version professeur) d'une ressource existante.
 *   2. On le re-soumet au LLM avec les RÈGLES de transformation du profil ciblé,
 *      en imposant le MÊME schéma Zod (structured outputs) → cohérence garantie.
 *   3. postProcess() ré-injecte les données de référence (texte corpus exact) :
 *      la fidélité littéraire est préservée même pour les profils dys/allophone
 *      (on n'altère JAMAIS le texte source, seulement l'appareil pédagogique).
 *   4. toStudentVersion() + toMarkdown.eleve() dérivent la variante élève.
 *
 * Une variante est une RessourceStructuree audience='eleve', porteuse d'un `profil`
 * et reliée à la ressource professeur source par `derived_from`.
 *
 * Limite assumée (v1) : la variante est élève-uniquement. Le corrigé professeur
 * reste celui de la version standard (les énoncés adaptés peuvent légèrement en
 * diverger). Voir doc/differenciation.md.
 */

import { createLLMProvider } from '@/backend/llm-provider'
import { validateLLMOutput } from '@/backend/validation'
import { getResourceDefinition } from './registry'
import { newId, now } from '@/backend/db'
import type { ResourceGenerationContext } from './registry'
import type { LLMMessage } from '@/backend/llm-provider'
import { PROFIL_UI } from '@/shared/differentiation-profils'
import type {
  RessourceType,
  RessourceStructuree,
  DifferentiationProfil,
} from '@/shared/schemas'

// ── Règles de transformation (prompt) par profil ────────────────────────────────
// Les métadonnées UI (label, description, rendu police) vivent dans
// src/shared/differentiation-profils.ts (importable côté client). Ici on ne garde
// que les instructions LLM, propres au backend.

export const PROFIL_PROMPTS: Record<Exclude<DifferentiationProfil, 'standard'>, string> = {
  allegee: [
    'PROFIL « ALLÉGÉE » (élèves en difficulté). Adapte la ressource ainsi :',
    '- RÉDUIS le nombre de questions / d\'étapes / d\'items aux essentiels (garde la progression, supprime le superflu).',
    '- SIMPLIFIE les consignes : une seule tâche par consigne, verbe d\'action explicite en tête.',
    '- AJOUTE de l\'étayage : amorces de réponse, exemples, rappels de méthode, indices entre parenthèses.',
    '- Vise la RÉUSSITE : difficulté abaissée d\'un cran, mais le même objectif d\'apprentissage est visé.',
    '- Conserve le vocabulaire technique indispensable, mais explicite-le.',
  ].join('\n'),
  enrichie: [
    'PROFIL « ENRICHIE » (élèves rapides / à l\'aise). Adapte la ressource ainsi :',
    '- AJOUTE des questions d\'approfondissement, d\'analyse fine, d\'interprétation ou de mise en réseau.',
    '- Propose au moins une OUVERTURE (prolongement, comparaison, point de vue critique).',
    '- AUGMENTE l\'exigence : formulations plus ouvertes, attendus plus ambitieux, moins d\'étayage.',
    '- Garde le même cœur d\'objectif, mais pousse vers l\'autonomie et la complexité.',
  ].join('\n'),
  dys: [
    'PROFIL « DYS » (élèves dyslexiques / dyspraxiques). Adapte la ressource ainsi :',
    '- PHRASES COURTES : une idée par phrase, syntaxe simple (sujet-verbe-complément).',
    '- LEXIQUE SIMPLE : remplace les mots rares par des équivalents courants ; explicite ceux qui restent.',
    '- Une SEULE consigne à la fois, jamais de double tâche dans une même question.',
    '- Mets les MOTS-CLÉS importants en **gras** pour guider le repérage.',
    '- Aère : numérote, sépare clairement les étapes.',
    'IMPORTANT : n\'altère JAMAIS un texte d\'œuvre cité (il est ré-injecté tel quel). Adapte uniquement consignes, questions, glossaire et notes.',
  ].join('\n'),
  allophone: [
    'PROFIL « ALLOPHONE » (élèves allophones, français langue seconde). Adapte la ressource ainsi :',
    '- REFORMULE les consignes dans un français très explicite, au présent, à la voix active.',
    '- ENRICHIS le glossaire / les notes : définis tout mot potentiellement inconnu, avec un synonyme simple.',
    '- Évite les implicites culturels ; explicite les références.',
    '- Privilégie des supports de réponse guidés (listes de mots, débuts de phrases, appariements).',
    '- Garde des phrases courtes et un lexique de haute fréquence.',
    'IMPORTANT : n\'altère JAMAIS un texte d\'œuvre cité (il est ré-injecté tel quel). Adapte uniquement consignes, questions, glossaire et notes.',
  ].join('\n'),
}

/** Profils différenciables (clés de PROFIL_UI / PROFIL_PROMPTS), pour validation. */
export const PROFIL_DEFINITIONS = PROFIL_UI

// ── Générateur de variante ──────────────────────────────────────────────────────

export interface GenerateVariantOptions {
  /** Type de la ressource source. */
  type: RessourceType
  /** Profil cible (différent de 'standard'). */
  profil: Exclude<DifferentiationProfil, 'standard'>
  /** JSON COMPLET (version professeur) de la ressource source. */
  baseContent: Record<string, unknown>
  /** Id de la ressource professeur source (pour derived_from). */
  baseProfId: string
  /** Contexte pédagogique (corpus, séquence…), identique à la génération initiale. */
  context: ResourceGenerationContext
  provider?: string
}

/**
 * Génère une variante différenciée (ressource élève) à partir d'une ressource existante.
 * Throws si le type est inconnu, si le type ne supporte pas les versions élève
 * (TEACHER_ONLY), ou si la génération/validation LLM échoue après retry.
 */
export async function generateVariant(opts: GenerateVariantOptions): Promise<RessourceStructuree> {
  const { type, profil, baseContent, baseProfId, context, provider } = opts

  const definition = getResourceDefinition(type)
  if (!definition) {
    throw new Error(`Type de ressource inconnu ou non enregistré : "${type}"`)
  }
  if (definition.category !== 'TWO_VERSIONS' || !definition.toStudentVersion || !definition.toMarkdown.eleve) {
    throw new Error(`Le type "${type}" n'a pas de version élève : la différenciation ne s'applique pas.`)
  }

  const promptInstructions = PROFIL_PROMPTS[profil]
  if (!promptInstructions) {
    throw new Error(`Profil de différenciation inconnu : "${profil}"`)
  }

  // 1. Réutilise le prompt de génération du type (corpus + ancrage pédagogique),
  //    puis ajoute la consigne de transformation différenciée sur le JSON existant.
  const baseMessages = definition.buildPrompt(context)
  const transformMessage: LLMMessage = {
    role: 'user',
    content: [
      'Tu vas ADAPTER une ressource pédagogique déjà rédigée à un profil d\'élève particulier.',
      '',
      promptInstructions,
      '',
      'Voici la ressource actuelle (JSON complet, version professeur) à adapter :',
      '```json',
      JSON.stringify(baseContent, null, 2),
      '```',
      '',
      'Produis la VERSION ADAPTÉE en respectant EXACTEMENT le même schéma JSON.',
      'Conserve la cohérence interne (les corrigés/notes doivent correspondre aux énoncés adaptés).',
      'Ne change ni le titre de l\'œuvre, ni les références bibliographiques, ni un texte d\'œuvre cité.',
    ].join('\n'),
  }
  const messages: LLMMessage[] = [...baseMessages, transformMessage]

  // 2. Appel LLM (structured outputs sur le schéma du type)
  const llm = createLLMProvider(provider)
  const schemaName = `ressource_${type}_${profil}`
  const rawResponse = await llm.chat(messages, {
    temperature: 0.6,
    schema: definition.schema,
    schemaName,
  })

  // 3. Validation avec retry
  const validated = await validateLLMOutput({
    schema: definition.schema,
    raw: rawResponse.content,
    context: schemaName,
    llm,
    messages,
    options: { temperature: 0.6, schema: definition.schema, schemaName },
    maxRetries: 1,
  })

  // 4. Post-traitement (ré-injection texte corpus exact) puis dérivation élève
  const fullContent = definition.postProcess
    ? definition.postProcess(validated, context)
    : validated
  const studentContent = definition.toStudentVersion(fullContent)
  const markdownEleve = definition.toMarkdown.eleve(studentContent)

  return {
    id: newId(),
    activite_id: context.activiteId,
    corpus_refs: context.corpusRefs ?? (context.corpusItems ?? []).map((item) => item.id),
    type,
    audience: 'eleve',
    profil,
    derived_from: baseProfId,
    contenu_json: studentContent as Record<string, unknown>,
    contenu_markdown: markdownEleve,
    created_at: now(),
  }
}
