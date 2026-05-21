import { NextRequest } from 'next/server'
import { createLLMProvider, LLMMessage } from '@/backend/llm-provider'

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
      provider
    } = body

    if (!ressourceType || !ressourceTitle) {
      return new Response(JSON.stringify({ error: 'Le type et le titre de la ressource sont requis.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const llm = createLLMProvider(provider)

    // Construction du prompt spécialisé pour l'écrivain de ressources
    const systemPrompt = `Tu es l'Agent RessourceWriter, un professeur de français expert agrégé de l'Éducation Nationale.
Ton rôle est de rédiger un document pédagogique d'accompagnement de très haute qualité au format **Markdown** brut.

INFORMATIONS DE CONTEXTE :
- Titre de la Séquence : "${sequenceTitle || 'Non spécifié'}"
- Niveau scolaire : ${niveau || '5e'}
- Thème/Objet d'étude : "${theme || 'Non spécifié'}"
- Séance n°${seanceNumero || 1} : "${seanceTitle || 'Non spécifié'}"
${activiteTitle ? `- Activité : "${activiteTitle}" (Type : ${activiteType || 'Exercice'})` : ''}

TYPE DE RESSOURCE À RÉDIGER : "${ressourceType}"
TITRE DU DOCUMENT : "${ressourceTitle}"
${ressourceType === 'exercice' && formatExercice ? `FORMAT DE L'EXERCICE DEMANDÉ : "${formatExercice}"` : ''}

RÈGLES D'ÉCRITURE :
1. Rédige le document UNIQUEMENT en Markdown brut. Ne l'entoure PAS de blocs de code style \`\`\`markdown ou \`\`\`json. Commence directement par le titre principal avec #.
2. Le ton doit être bienveillant, stimulant et adapté à des élèves de ${niveau || '5e'} (vocabulaire clair, exemples vivants).
3. Ne mets aucune phrase d'introduction comme "Voici votre document :" ou de conclusion. Donne uniquement le contenu du document.

CONSIGNES SPÉCIFIQUES PAR TYPE DE RESSOURCE :
- **cours** (Cours théorique) : Rédige une synthèse théorique structurée. Utilise des sous-titres (##), des encadrés (blocs de citation \`> \`) pour les définitions et des exemples clairs. Ajoute à la fin un encadré "💡 La règle d'or / À retenir absolument".
- **bilan** (Bilan & Synthèse) : Fais une fiche de récapitulation rapide sous forme de mémo. Inclus un questionnaire d'auto-évaluation sous forme de cases à cocher (\`- [ ] Je sais identifier...\`, \`- [ ] Je suis capable de...\`) et un mini-lexique des 3-5 notions clés.
- **extrait_oeuvre** (Extrait d'œuvre) : Choisis ou simule (selon le niveau et le thème) un extrait littéraire cohérent et court (15-25 lignes). Présente brièvement le texte (auteur, œuvre, contexte) dans un petit paragraphe d'introduction en italique. Affiche le texte avec des numéros de ligne (ex: [5], [10]) dans un bloc de citation. Ajoute un petit lexique des mots difficiles en fin de texte.
- **oeuvre_complete** (Texte court complet) : Même structure que l'extrait, mais adapté pour une œuvre intégrale très courte (un poème complet, une fable d'Ésope/La Fontaine ou un conte court). Propose 3 questions rapides de lecture pour guider la compréhension globale.
- **exercice** (Fiche d'exercice) : Propose 3 exercices progressifs (Exercice 1 : Identifier [Facile], Exercice 2 : Manipuler [Moyen], Exercice 3 : Rédiger/Créer [Difficile]). Adapte les exercices au format demandé :
  - *texte_a_trous* : Le texte doit avoir des trous clairs signalés par des crochets comme \`[__________]\` ou des pointillés \`......\`. Propose une boîte à mots au début ou des indices entre parenthèses.
  - *relier_notions* : Présente les notions à relier sous forme de tableau Markdown à deux colonnes (Mélangées !). Demande à l'élève d'associer un chiffre à une lettre (ex: 1-C, 2-A).
  - *entourer_reponse* : Rédige des questions à choix multiples ou des affirmations où l'élève doit cocher ou entourer. Utilise des cases \`- [ ] Option A\` et \`- [ ] Option B\`.
  - *questions_reponses* : Donne un court support ou 5 phrases et pose des questions précises avec des lignes de réponses vides (ex: \`Réponse : ..............................................\`).
  - *libre* : Exercices d'application classiques sur la grammaire, la conjugaison ou l'orthographe.`

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Rédige maintenant la ressource "${ressourceTitle}" au format Markdown brut.` }
    ]

    const response = await llm.chat(messages, { temperature: 0.7 })

    let markdown = response.content.trim()

    // Nettoyage robuste si le LLM a entouré le markdown de backticks
    const match = markdown.match(/^```(?:markdown)?\s*\n([\s\S]*?)\n```$/i)
    if (match) {
      markdown = match[1].trim()
    } else {
      markdown = markdown.replace(/^```(?:markdown)?\s*\n/i, '').replace(/\n```$/i, '')
    }

    return Response.json({
      content: markdown
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur interne lors de la génération de la ressource'
    return Response.json({ error: errorMsg }, { status: 500 })
  }
}
