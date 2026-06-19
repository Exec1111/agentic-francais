/**
 * Tests unitaires — buildBlankFichePair (création d'une fiche vierge, sans IA).
 *
 * Vérifie que la fiche vierge :
 *   - produit une paire prof/élève correctement liée,
 *   - satisfait le schéma (≥ 2 blocs) → donc s'ouvrira bien en mode blocs,
 *   - masque les champs PROF dans la version élève.
 */

import { describe, it, expect } from 'vitest'
import { buildBlankResourcePair } from '../generator'
import { FicheQuestionsContenuSchema } from '@/shared/resource-blocks'

const buildBlankFichePair = (activiteId?: string) => buildBlankResourcePair('fiche_questions', activiteId)

describe('buildBlankResourcePair — fiche_questions', () => {
  it('retourne une paire prof + élève liée par paired_with', () => {
    const paire = buildBlankFichePair('act-1')
    expect(paire.professeur.audience).toBe('professeur')
    expect(paire.eleve?.audience).toBe('eleve')
    expect(paire.professeur.paired_with).toBe(paire.eleve?.id)
    expect(paire.eleve?.paired_with).toBe(paire.professeur.id)
    expect(paire.professeur.id).not.toBe(paire.eleve?.id)
  })

  it('propage activite_id aux deux versions', () => {
    const paire = buildBlankFichePair('act-42')
    expect(paire.professeur.activite_id).toBe('act-42')
    expect(paire.eleve?.activite_id).toBe('act-42')
  })

  it('produit un contenu_json valide avec au moins 2 blocs (→ mode blocs)', () => {
    const paire = buildBlankFichePair()
    const parsed = FicheQuestionsContenuSchema.safeParse(paire.professeur.contenu_json)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.blocs.length).toBeGreaterThanOrEqual(2)
  })

  it('génère un Markdown non vide pour les deux versions', () => {
    const paire = buildBlankFichePair()
    expect(paire.professeur.contenu_markdown.length).toBeGreaterThan(0)
    expect(paire.eleve?.contenu_markdown.length).toBeGreaterThan(0)
  })

  it('la version élève a les champs PROF épurés', () => {
    const paire = buildBlankFichePair()
    const eleve = FicheQuestionsContenuSchema.parse(paire.eleve!.contenu_json)
    for (const bloc of eleve.blocs) {
      expect(bloc.reponse_attendue).toBeNull()
      expect(bloc.bonnes_reponses).toBeNull()
    }
  })
})
