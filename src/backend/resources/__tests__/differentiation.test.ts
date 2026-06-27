/**
 * Tests unitaires — différenciation (variantes élève adaptées).
 *
 * Couvre :
 *   - Cohérence des métadonnées profils (UI ⇄ prompts) : mêmes clés des deux côtés.
 *   - Présence des indices de rendu (police) pour dys & allophone uniquement.
 *   - generateVariant() rejette les types sans version élève (TEACHER_ONLY).
 */

import { describe, it, expect } from 'vitest'
import { PROFIL_PROMPTS, generateVariant } from '../differentiation'
import { PROFIL_UI, PROFIL_UI_LIST, getProfilUI, resolveActiveProfils } from '@/shared/differentiation-profils'
import type { ResourceGenerationContext } from '../registry'

const baseContext: ResourceGenerationContext = {
  sequenceTitle: 'Test',
  niveau: '5e',
  theme: 'Test',
  seanceNumero: 1,
  seanceTitle: 'S1',
  activiteTitre: 'A1',
  activiteType: 'exercice',
  activiteConsigne: 'Faire X',
  ressourceTitre: 'R1',
}

describe('métadonnées des profils', () => {
  it('PROFIL_UI et PROFIL_PROMPTS partagent exactement les mêmes clés', () => {
    expect(Object.keys(PROFIL_UI).sort()).toEqual(Object.keys(PROFIL_PROMPTS).sort())
  })

  it('expose les 4 profils différenciables', () => {
    expect(PROFIL_UI_LIST.map(p => p.id).sort()).toEqual(['allegee', 'allophone', 'dys', 'enrichie'])
  })

  it('seuls dys et allophone ont des indices de rendu (police adaptée)', () => {
    expect(PROFIL_UI.dys.render).toBeDefined()
    expect(PROFIL_UI.allophone.render).toBeDefined()
    expect(PROFIL_UI.allegee.render).toBeUndefined()
    expect(PROFIL_UI.enrichie.render).toBeUndefined()
  })

  it("getProfilUI ignore le profil 'standard'", () => {
    expect(getProfilUI('standard')).toBeUndefined()
    expect(getProfilUI('dys')?.label).toBe('Dys')
  })
})

describe('resolveActiveProfils (préférences classe)', () => {
  it('undefined → différenciation par niveau (allégée + enrichie)', () => {
    expect(resolveActiveProfils(undefined).map(p => p.id)).toEqual(['allegee', 'enrichie'])
  })

  it('[] → aucun profil (le prof a tout désactivé)', () => {
    expect(resolveActiveProfils([])).toEqual([])
  })

  it('filtre selon la liste, dans l\'ordre canonique', () => {
    expect(resolveActiveProfils(['dys', 'allegee']).map(p => p.id)).toEqual(['allegee', 'dys'])
  })

  it("ignore 'standard' et les valeurs hors profils différenciables", () => {
    expect(resolveActiveProfils(['standard', 'enrichie']).map(p => p.id)).toEqual(['enrichie'])
  })
})

describe('generateVariant — garde-fous', () => {
  it('rejette un type sans version élève (dictee = TEACHER_ONLY)', async () => {
    await expect(
      generateVariant({
        type: 'dictee',
        profil: 'allegee',
        baseContent: {},
        baseProfId: 'x',
        context: baseContext,
      })
    ).rejects.toThrow(/version élève/)
  })

  it('rejette un type inconnu', async () => {
    await expect(
      generateVariant({
        // @ts-expect-error type volontairement invalide
        type: 'type_inexistant',
        profil: 'dys',
        baseContent: {},
        baseProfId: 'x',
        context: baseContext,
      })
    ).rejects.toThrow(/inconnu/)
  })
})
