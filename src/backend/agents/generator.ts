import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { ArchitectOutput, GeneratorSeanceOutputSchema, Activite, CorpusItem } from '@/shared/schemas'

const SYSTEM_PROMPT = `Tu es l'Agent Générateur d'Activités d'une plateforme de conception de cours de français.

TON RÔLE : Créer les activités pédagogiques détaillées pour UNE séance donnée.

Pour chaque séance, tu dois produire 2 activités variées et adaptées au niveau.

Types d'activités possibles :
- exercice : travail individuel sur une notion
- production_ecrite : rédaction
- debat : échange oral structuré
- lecture : analyse de texte
- oral : expression orale
- evaluation : évaluation formative ou sommative
- collaboration : travail en groupe
- recherche : recherche documentaire

RÈGLES GÉNÉRALES :
- La somme des durées ne doit PAS dépasser la durée totale de la séance.
- Les consignes doivent être claires, précises et adressées aux élèves.
- Varie les types d'activités au sein d'une même séance.
- Respecte la progressivité (du simple au complexe).
- Adapte le vocabulaire et la difficulté au niveau scolaire.

RÈGLE ABSOLUE SUR LES TEXTES :
- Si des "TEXTES AU PROGRAMME" sont fournis dans la demande, toute activité de type "lecture", "exercice" ou "production_ecrite" DOIT se baser EXCLUSIVEMENT sur ces textes.
- Tu NE PEUX PAS inventer un texte fictif, un titre imaginaire ou un "document non fourni".
- Cite l'auteur et le titre exact du texte fourni dans la consigne.
- Si tu veux citer un passage, utilise UNIQUEMENT des extraits présents dans le texte fourni.`

export interface GeneratorOutput {
  seances: {
    numero: number
    titre: string
    activites: Activite[]
  }[]
}

function buildCorpusBlock(corpusItems: CorpusItem[]): string {
  if (corpusItems.length === 0) return ''
  return `

⚠️ TEXTES AU PROGRAMME — OBLIGATION ABSOLUE :
Tu DOIS baser les activités de lecture/exercice/production sur ces textes RÉELS.
N'invente AUCUN autre texte. N'écris JAMAIS "texte non fourni" ou "texte imaginé".

${corpusItems.map((item) =>
    [
      `━━━ TEXTE OFFICIEL : ${item.auteur}, « ${item.oeuvre} » ━━━`,
      `(${item.edition_reference}${item.pages ? `, ${item.pages}` : ''})`,
      item.contenu.slice(0, 800) + (item.contenu.length > 800 ? '\n[...]' : ''),
      `━━━ FIN DU TEXTE ━━━`,
    ].join('\n')
  ).join('\n\n')}
`
}

export async function runGenerator(
  llm: LLMProvider,
  architecture: ArchitectOutput,
  onLog: (msg: string) => void,
  corpusItems: CorpusItem[] = []
): Promise<GeneratorOutput> {
  onLog(`Génération des activités pour ${architecture.seances.length} séances...`)

  const corpusBlock = buildCorpusBlock(corpusItems)

  const results: GeneratorOutput = { seances: [] }

  for (const seance of architecture.seances) {
    onLog(`  → Séance ${seance.numero}: "${seance.titre}"...`)

    const userPrompt = `Génère les activités pour cette séance :
- Séquence : "${architecture.titre_sequence}"
- Niveau : ${architecture.niveau}
- Thème : ${architecture.theme}
- Séance n°${seance.numero} : "${seance.titre}"
- Durée : ${seance.duree} minutes
- Objectifs de la séance : ${seance.objectifs.join(', ')}
- Objectifs globaux de la séquence : ${architecture.objectifs.join(', ')}${corpusBlock}`

    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]

    const chatOptions = { temperature: 0.8, schema: GeneratorSeanceOutputSchema, schemaName: 'generator_seance' }
    const response = await llm.chat(messages, chatOptions)

    const parsed = await validateLLMOutput({
      schema: GeneratorSeanceOutputSchema,
      raw: response.content,
      context: `generateur/seance-${seance.numero}`,
      llm,
      messages,
      options: chatOptions,
      maxRetries: 1,
      onLog,
    })

    results.seances.push({
      numero: seance.numero,
      titre: seance.titre,
      activites: parsed.activites.map((a) => ({
        ...a,
        differenciation: a.differenciation ?? undefined,
        ressources: [],
      })),
    })

    onLog(`    ✓ ${parsed.activites.length} activités générées`)
  }

  onLog(`✓ Toutes les activités générées (${results.seances.reduce((acc, s) => acc + s.activites.length, 0)} au total)`)
  return results
}
