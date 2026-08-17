import { NextRequest } from 'next/server'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { generateVariant, PROFIL_DEFINITIONS } from '@/backend/resources/differentiation'
import { saveRessource } from '@/backend/repositories/resource-repo'
import { RessourceTypeSchema, DifferentiationProfilSchema } from '@/shared/schemas'
import type { ResourceGenerationContext, ActiviteType } from '@/backend/resources/registry'
import type { DifferentiationProfil } from '@/shared/schemas'

/**
 * POST /api/generate/resource/variant
 *
 * Génère une VARIANTE différenciée (version élève adaptée) d'une ressource existante.
 *
 * Body :
 * {
 *   type:          RessourceType         — type de la ressource source
 *   profil:        'allegee'|'enrichie'|'dys'|'allophone'
 *   baseContent:   object                — JSON complet (version professeur) de la source
 *   baseProfId:    string                — id de la ressource professeur source
 *
 *   // Même contexte pédagogique que /api/generate/resource (corpus, séquence…)
 *   sequenceTitle, niveau, theme, seanceNumero, seanceTitle, activiteId, activiteTitre,
 *   activiteType, activiteConsigne, ressourceTitre, corpus_refs / corpus_ref,
 *   sequenceProblematique, sequenceObjectifs, sequenceCompetences, seanceObjectifs,
 *   activiteDuree, progression, autresActivites, consignes, provider
 * }
 *
 * Réponse : RessourceStructuree (audience 'eleve', profil renseigné, derived_from = baseProfId).
 * Sauvegardée en DB si activiteId est fourni et que la ressource source y existe.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      type,
      profil,
      baseContent,
      baseProfId,
      sequenceTitle,
      niveau,
      theme,
      seanceNumero,
      seanceTitle,
      activiteId,
      activiteTitre,
      activiteType,
      activiteConsigne,
      ressourceTitre,
      corpus_ref,
      corpus_refs,
      provider,
      sequenceProblematique,
      sequenceObjectifs,
      sequenceCompetences,
      seanceObjectifs,
      activiteDuree,
      progression,
      autresActivites,
      consignes,
    } = body

    // ── Validation ──────────────────────────────────────────────────────────
    const typeValidation = RessourceTypeSchema.safeParse(type)
    if (!typeValidation.success) {
      return Response.json({ error: `Type de ressource inconnu : "${type}"` }, { status: 400 })
    }

    const profilValidation = DifferentiationProfilSchema.safeParse(profil)
    if (!profilValidation.success || profil === 'standard' || !(profil in PROFIL_DEFINITIONS)) {
      return Response.json(
        { error: `Profil de différenciation invalide : "${profil}" (attendu : allegee, enrichie, dys ou allophone).` },
        { status: 400 }
      )
    }

    if (!baseContent || typeof baseContent !== 'object') {
      return Response.json(
        { error: 'Le champ baseContent (JSON de la ressource source) est requis.' },
        { status: 400 }
      )
    }
    if (!baseProfId || typeof baseProfId !== 'string') {
      return Response.json({ error: 'Le champ baseProfId est requis.' }, { status: 400 })
    }

    // ── Résolution corpus (identique à la route de génération) ───────────────
    const refIds: string[] = Array.isArray(corpus_refs) && corpus_refs.length > 0
      ? corpus_refs
      : (corpus_ref ? [corpus_ref] : [])
    const corpusItems = refIds
      .map((id) => getCorpusById(id))
      .filter((item): item is NonNullable<ReturnType<typeof getCorpusById>> => item != null)
    const corpusItem = corpusItems[0] ?? null

    const context: ResourceGenerationContext = {
      sequenceTitle: sequenceTitle || '',
      niveau: niveau || '5e',
      theme: theme || '',
      seanceNumero: seanceNumero || 1,
      seanceTitle: seanceTitle || '',
      activiteId: activiteId || undefined,
      activiteTitre: activiteTitre || ressourceTitre || '',
      activiteType: (activiteType || 'exercice') as ActiviteType,
      activiteConsigne: activiteConsigne || '',
      ressourceTitre: ressourceTitre || '',
      corpusItem,
      corpusItems,
      corpusRefs: corpusItems.map((item) => item.id),
      sequenceProblematique: typeof sequenceProblematique === 'string' ? sequenceProblematique : undefined,
      sequenceObjectifs: Array.isArray(sequenceObjectifs) ? sequenceObjectifs : undefined,
      sequenceCompetences: Array.isArray(sequenceCompetences) ? sequenceCompetences : undefined,
      seanceObjectifs: Array.isArray(seanceObjectifs) ? seanceObjectifs : undefined,
      activiteDuree: typeof activiteDuree === 'number' ? activiteDuree : undefined,
      progression: Array.isArray(progression) ? progression : undefined,
      autresActivites: Array.isArray(autresActivites) ? autresActivites : undefined,
      consignes: typeof consignes === 'string' ? consignes : undefined,
    }

    // ── Génération de la variante ────────────────────────────────────────────
    const variante = await generateVariant({
      type: typeValidation.data,
      profil: profil as Exclude<DifferentiationProfil, 'standard'>,
      baseContent: baseContent as Record<string, unknown>,
      baseProfId,
      context,
      provider,
    })

    // ── Sauvegarde (best-effort : ne fait pas échouer la génération) ─────────
    if (activiteId) {
      try {
        saveRessource(variante)
      } catch (saveErr) {
        console.warn('[resource/variant] Persistance DB ignorée :', saveErr)
      }
    }

    return Response.json(variante)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne lors de la génération de la variante'
    console.error('[POST /api/generate/resource/variant]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
