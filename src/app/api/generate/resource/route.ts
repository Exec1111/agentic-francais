import { NextRequest } from 'next/server'
import { createLLMProvider, LLMMessage } from '@/backend/llm-provider'
import { getCorpusById } from '@/backend/repositories/corpus-repo'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sequenceTitle,
      niveau,
      theme,
      seanceNumero,
      seanceTitle,
      activiteTitle,
      activiteType,
      ressourceTitle,
      ressourceType,
      formatExercice,
      corpus_ref,
      provider,
    } = body

    if (!ressourceType || !ressourceTitle) {
      return new Response(JSON.stringify({ error: 'Le type et le titre de la ressource sont requis.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // === Résolution du corpus ===
    let corpusItem = corpus_ref ? getCorpusById(corpus_ref) : null

    // Si le type demande un texte source et qu'on n'a pas de corpus_ref,
    // on retourne une erreur explicite plutôt que de laisser l'IA inventer.
    if ((ressourceType === 'extrait_oeuvre' || ressourceType === 'oeuvre_complete') && !corpusItem) {
      if (corpus_ref) {
        return new Response(
          JSON.stringify({ error: `Texte source introuvable dans le corpus (id: ${corpus_ref}). Ajoutez le texte au corpus avant de générer cette ressource.` }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        )
      }
      // Pas de corpus_ref du tout → l'IA génère (comportement legacy, à terme déprécié)
      corpusItem = null
    }

    const llm = createLLMProvider(provider)

    // === Construction du prompt selon le cas ===
    const messages = buildMessages({
      sequenceTitle,
      niveau,
      theme,
      seanceNumero,
      seanceTitle,
      activiteTitle,
      activiteType,
      ressourceTitle,
      ressourceType,
      formatExercice,
      corpusItem,
    })

    const response = await llm.chat(messages, { temperature: 0.7 })

    let markdown = response.content.trim()
    const match = markdown.match(/^```(?:markdown)?\s*\n([\s\S]*?)\n```$/i)
    if (match) {
      markdown = match[1].trim()
    } else {
      markdown = markdown.replace(/^```(?:markdown)?\s*\n/i, '').replace(/\n```$/i, '')
    }

    return Response.json({ content: markdown })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur interne lors de la génération de la ressource'
    return Response.json({ error: errorMsg }, { status: 500 })
  }
}

// === Construction des messages selon le type de ressource et la présence du corpus ===

interface BuildOptions {
  sequenceTitle: string
  niveau: string
  theme: string
  seanceNumero: number
  seanceTitle: string
  activiteTitle?: string
  activiteType?: string
  ressourceTitle: string
  ressourceType: string
  formatExercice?: string
  corpusItem: Awaited<ReturnType<typeof getCorpusById>>
}

function buildMessages(opts: BuildOptions): LLMMessage[] {
  const {
    sequenceTitle, niveau, theme, seanceNumero, seanceTitle,
    activiteTitle, activiteType, ressourceTitle, ressourceType,
    formatExercice, corpusItem,
  } = opts

  const contextBlock = `INFORMATIONS DE CONTEXTE :
- Titre de la Séquence : "${sequenceTitle || 'Non spécifié'}"
- Niveau scolaire : ${niveau || '5e'}
- Thème/Objet d'étude : "${theme || 'Non spécifié'}"
- Séance n°${seanceNumero || 1} : "${seanceTitle || 'Non spécifié'}"
${activiteTitle ? `- Activité : "${activiteTitle}" (Type : ${activiteType || 'Exercice'})` : ''}`

  // === CAS CORPUS : extrait_oeuvre ou oeuvre_complete ===
  if (corpusItem && (ressourceType === 'extrait_oeuvre' || ressourceType === 'oeuvre_complete')) {
    return [
      {
        role: 'system',
        content: `Tu es l'Agent RessourceWriter, un professeur de français expert agrégé de l'Éducation Nationale.
Tu reçois un texte littéraire EXACT issu d'une base de référence vérifiée.
Ta mission est de le présenter pédagogiquement en Markdown brut, sans modifier un seul mot du texte.

${contextBlock}

TEXTE SOURCE OFFICIEL — NE PAS MODIFIER :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${corpusItem.auteur}
Œuvre      : ${corpusItem.oeuvre}
Référence  : ${corpusItem.edition_reference}${corpusItem.pages ? ` — ${corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${corpusItem.contenu}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RÈGLES ABSOLUES :
1. Le texte ci-dessus doit apparaître MOT POUR MOT dans ta réponse, sans modification.
2. Tu ajoutes uniquement : une introduction contextuelle en italique, la numérotation des vers/lignes (tous les 5), et un lexique des termes difficiles.
3. Formate en Markdown brut. Ne commence pas par \`\`\`markdown.`,
      },
      {
        role: 'user',
        content: `Présente pédagogiquement ce texte pour la ressource "${ressourceTitle}".

Structure attendue :
1. **Titre** (# ${ressourceTitle})
2. *Introduction contextuelle* (2-3 phrases en italique : auteur, œuvre, contexte historique/littéraire, enjeux de cet extrait)
3. Le texte exact avec numérotation des lignes/vers tous les 5 (ex: \`[5]\`, \`[10]\`) dans un bloc de citation (\`>\`)
4. **Lexique** (## Lexique) : 4-8 mots difficiles avec définition courte adaptée au niveau ${niveau}
5. La référence complète en bas : *${corpusItem.auteur}, « ${corpusItem.oeuvre} »${corpusItem.pages ? `, ${corpusItem.pages}` : ''}, ${corpusItem.edition_reference}*`,
      },
    ]
  }

  // === CAS CORPUS : exercice basé sur un texte corpus ===
  if (corpusItem && ressourceType === 'exercice') {
    const formatInstruction = formatExercice ? getFormatInstruction(formatExercice) : ''
    return [
      {
        role: 'system',
        content: `Tu es l'Agent RessourceWriter, un professeur de français expert agrégé de l'Éducation Nationale.
Tu crées une fiche d'exercices basée EXCLUSIVEMENT sur un texte littéraire fourni. Toute citation dans tes exercices doit être extraite MOT POUR MOT du texte. Tu ne peux pas inventer de citations.

${contextBlock}

TEXTE SOURCE OFFICIEL (base des exercices) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${corpusItem.auteur}
Œuvre      : ${corpusItem.oeuvre}
Référence  : ${corpusItem.edition_reference}${corpusItem.pages ? ` — ${corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${corpusItem.contenu}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE DE RESSOURCE : "${ressourceType}"
TITRE : "${ressourceTitle}"
${formatExercice ? `FORMAT DE L'EXERCICE : "${formatExercice}"` : ''}

RÈGLES :
1. Rédige en Markdown brut. Ne commence pas par \`\`\`markdown.
2. Toutes les citations doivent être entre guillemets et tirées mot pour mot du texte source.
3. Indique la référence complète en bas du document.
${formatInstruction}`,
      },
      {
        role: 'user',
        content: `Rédige la fiche d'exercices "${ressourceTitle}" en te basant EXCLUSIVEMENT sur le texte de ${corpusItem.auteur}. Propose 3 exercices progressifs (Facile → Moyen → Difficile).`,
      },
    ]
  }

  // === CAS CORPUS : cours ou bilan avec référence à un texte corpus ===
  if (corpusItem && (ressourceType === 'cours' || ressourceType === 'bilan')) {
    return [
      {
        role: 'system',
        content: `Tu es l'Agent RessourceWriter, un professeur de français expert agrégé de l'Éducation Nationale.
Tu rédiges un document pédagogique en Markdown brut, en lien avec un texte littéraire de référence.

${contextBlock}

TEXTE ÉTUDIÉ DANS CETTE SÉANCE :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${corpusItem.auteur}, « ${corpusItem.oeuvre} »${corpusItem.pages ? ` (${corpusItem.pages})` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE DE RESSOURCE : "${ressourceType}"
TITRE : "${ressourceTitle}"

RÈGLES :
1. Rédige en Markdown brut. Ne commence pas par \`\`\`markdown.
2. Intègre des exemples et citations tirés du texte de référence quand c'est pertinent.
3. Citations : extraites mot pour mot, entre guillemets, avec référence entre parenthèses.
${getRessourceInstructions(ressourceType, niveau)}`,
      },
      {
        role: 'user',
        content: `Rédige maintenant la ressource "${ressourceTitle}" au format Markdown brut.`,
      },
    ]
  }

  // === CAS SANS CORPUS (comportement original) ===
  return [
    {
      role: 'system',
      content: `Tu es l'Agent RessourceWriter, un professeur de français expert agrégé de l'Éducation Nationale.
Ton rôle est de rédiger un document pédagogique d'accompagnement de très haute qualité au format **Markdown** brut.

${contextBlock}

TYPE DE RESSOURCE À RÉDIGER : "${ressourceType}"
TITRE DU DOCUMENT : "${ressourceTitle}"
${ressourceType === 'exercice' && formatExercice ? `FORMAT DE L'EXERCICE DEMANDÉ : "${formatExercice}"` : ''}

RÈGLES D'ÉCRITURE :
1. Rédige le document UNIQUEMENT en Markdown brut. Ne l'entoure PAS de blocs de code.
2. Le ton doit être bienveillant, stimulant et adapté à des élèves de ${niveau || '5e'}.
3. Ne mets aucune phrase d'introduction ou de conclusion parasite.

${getRessourceInstructions(ressourceType, niveau, formatExercice)}`,
    },
    {
      role: 'user',
      content: `Rédige maintenant la ressource "${ressourceTitle}" au format Markdown brut.`,
    },
  ]
}

function getRessourceInstructions(ressourceType: string, niveau: string, formatExercice?: string): string {
  switch (ressourceType) {
    case 'cours':
      return `CONSIGNES : Rédige une synthèse théorique structurée. Utilise des sous-titres (##), des encadrés (\`> \`) pour les définitions et des exemples clairs. Ajoute à la fin un encadré "💡 À retenir absolument".`
    case 'bilan':
      return `CONSIGNES : Fiche de récapitulation rapide. Inclus un questionnaire d'auto-évaluation (\`- [ ] Je sais...\`) et un mini-lexique des 3-5 notions clés.`
    case 'extrait_oeuvre':
      return `CONSIGNES : Choisis un extrait littéraire cohérent (15-25 lignes). Présente l'auteur/contexte en italique. Affiche le texte avec numéros de ligne dans un bloc de citation. Ajoute un lexique.`
    case 'oeuvre_complete':
      return `CONSIGNES : Même structure que l'extrait, adapté pour une œuvre intégrale très courte (poème, fable, conte court). Propose 3 questions de lecture rapide.`
    case 'exercice':
      return `CONSIGNES : 3 exercices progressifs (Exercice 1 : Facile, Exercice 2 : Moyen, Exercice 3 : Difficile). ${formatExercice ? getFormatInstruction(formatExercice) : ''}`
    default:
      return ''
  }
}

function getFormatInstruction(formatExercice: string): string {
  switch (formatExercice) {
    case 'texte_a_trous':
      return 'Trous signalés par `[__________]`. Propose une boîte à mots.'
    case 'relier_notions':
      return 'Tableau Markdown deux colonnes mélangées. Association chiffre ↔ lettre.'
    case 'entourer_reponse':
      return 'QCM avec cases `- [ ] Option`. Minimum 3 choix par question.'
    case 'questions_reponses':
      return 'Questions précises avec lignes de réponses vides (`Réponse : ............`).'
    case 'libre':
      return 'Exercices d\'application classiques progressifs.'
    default:
      return ''
  }
}
