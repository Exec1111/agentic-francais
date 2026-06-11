/**
 * Générateur de ressources pédagogiques structurées.
 *
 * Flux :
 *   1. Récupère la définition du type depuis le registre
 *   2. Construit les messages LLM via buildPrompt()
 *   3. Appelle le LLM avec structured outputs (schéma Zod → JSON Schema)
 *   4. Valide la réponse avec validateLLMOutput (avec retry)
 *   4b. Applique postProcess() si défini (injection par code du texte corpus exact)
 *   5. Dérive les deux versions (prof + élève) depuis le JSON complet
 *   6. Rend le Markdown pour chaque version
 *   7. Retourne une RessourcePaire prête à sauvegarder
 */

import { createLLMProvider } from '@/backend/llm-provider'
import { validateLLMOutput } from '@/backend/validation'
import { getResourceDefinition } from './registry'
import { newId, now } from '@/backend/db'
import type { RessourceType, RessourcePaire, RessourceStructuree } from '@/shared/schemas'
import type { ResourceGenerationContext } from './registry'

export interface GenerateResourceOptions {
  type: RessourceType
  context: ResourceGenerationContext
  provider?: string
}

/**
 * Génère une paire de ressources (professeur + élève optionnel) en un seul appel LLM.
 * Throws si le type est inconnu, si le corpus est manquant pour les types qui l'exigent,
 * ou si la génération/validation LLM échoue après retry.
 */
export async function generateResourcePair(opts: GenerateResourceOptions): Promise<RessourcePaire> {
  const { type, context, provider } = opts

  // 1. Récupérer la définition du type
  const definition = getResourceDefinition(type)
  if (!definition) {
    throw new Error(`Type de ressource inconnu ou non enregistré : "${type}"`)
  }

  // 2. Construire les messages (peut throw si corpus manquant et requis)
  const messages = definition.buildPrompt(context)

  // 3. Appel LLM avec structured outputs
  const llm = createLLMProvider(provider)
  const rawResponse = await llm.chat(messages, {
    temperature: 0.7,
    schema: definition.schema,
    schemaName: `ressource_${type}`,
  })

  // 4. Validation avec retry automatique
  const validated = await validateLLMOutput({
    schema: definition.schema,
    raw: rawResponse.content,
    context: `ressource_${type}`,
    llm,
    messages,
    options: { temperature: 0.7, schema: definition.schema, schemaName: `ressource_${type}` },
    maxRetries: 1,
  })

  // 4b. Post-traitement : injection par code des données de référence
  // (ex : texte corpus exact — jamais recopié par le LLM)
  const fullContent = definition.postProcess
    ? definition.postProcess(validated, context)
    : validated

  // 5 & 6. Générer les deux versions
  const profId = newId()
  const eleveId = definition.category === 'TWO_VERSIONS' ? newId() : undefined
  const timestamp = now()

  const markdownProf = definition.toMarkdown.professeur(fullContent)

  const professeur: RessourceStructuree = {
    id: profId,
    activite_id: context.activiteId,
    type,
    audience: 'professeur',
    paired_with: eleveId,
    contenu_json: fullContent as Record<string, unknown>,
    contenu_markdown: markdownProf,
    created_at: timestamp,
  }

  if (
    definition.category === 'TWO_VERSIONS' &&
    definition.toStudentVersion &&
    definition.toMarkdown.eleve &&
    eleveId
  ) {
    const studentContent = definition.toStudentVersion(fullContent)
    const markdownEleve = definition.toMarkdown.eleve(studentContent)

    const eleve: RessourceStructuree = {
      id: eleveId,
      activite_id: context.activiteId,
      type,
      audience: 'eleve',
      paired_with: profId,
      contenu_json: studentContent as Record<string, unknown>,
      contenu_markdown: markdownEleve,
      created_at: timestamp,
    }

    return { professeur, eleve }
  }

  return { professeur }
}
