/**
 * Tests unitaires — type `cours` (blocs de contenu).
 *
 * Couvre :
 *   1. Helpers de schéma (createEmptyCoursBloc, sanitizeCoursBloc, stripCoursBlocProf).
 *   2. Rendu Markdown (fallback PDF) prof vs élève : les notes pédagogiques
 *      n'apparaissent QUE pour le professeur.
 *   3. Création vierge via buildBlankResourcePair('cours').
 */

import { describe, it, expect } from 'vitest'
import { coursDefinition } from '../types/cours'
import { buildBlankResourcePair } from '../generator'
import {
  createEmptyCoursBloc,
  sanitizeCoursBloc,
  stripCoursBlocProf,
  CoursContenuSchema,
  type CoursBloc,
  type CoursContenu,
} from '@/shared/resource-blocks-cours'

// ── Fixtures ────────────────────────────────────────────────────────────────────

const fiche = (blocs: CoursBloc[]): CoursContenu => ({
  titre: 'La poésie lyrique',
  introduction: null,
  note_prof_globale: 'Prévoir 2 séances.',
  blocs,
})

const definition = (): CoursBloc => ({
  ...createEmptyCoursBloc('definition', 'd1'),
  terme: 'Lyrisme',
  texte: 'Expression poétique des sentiments personnels.',
  note_prof: 'Insister sur le « je » lyrique.',
})

const md = (contenu: CoursContenu, audience: 'professeur' | 'eleve') =>
  coursDefinition.toMarkdown[audience]!(contenu as never)

// ── Helpers de schéma ─────────────────────────────────────────────────────────

describe('createEmptyCoursBloc', () => {
  it('definition : initialise terme + texte', () => {
    const b = createEmptyCoursBloc('definition', 'x')
    expect(b.terme).toBe('')
    expect(b.texte).toBe('')
  })

  it('liste : initialise items', () => {
    expect(createEmptyCoursBloc('liste', 'x').items).toEqual(['', ''])
  })

  it('encadre : initialise variante + titre', () => {
    const b = createEmptyCoursBloc('encadre', 'x')
    expect(b.encadre_variante).toBe('rappel')
    expect(b.encadre_titre).toBe('À retenir')
  })
})

describe('sanitizeCoursBloc', () => {
  it('met à null les champs hors-type', () => {
    const pollue: CoursBloc = { ...createEmptyCoursBloc('paragraphe', 'p'), texte: 'ok', terme: 'NON', items: ['x'] }
    const clean = sanitizeCoursBloc(pollue)
    expect(clean.texte).toBe('ok')
    expect(clean.terme).toBeNull()
    expect(clean.items).toBeNull()
  })
})

describe('stripCoursBlocProf', () => {
  it('retire note_prof', () => {
    expect(stripCoursBlocProf(definition()).note_prof).toBeNull()
  })
})

// ── Rendu Markdown / PDF ─────────────────────────────────────────────────────────

describe('Markdown cours — notes pédagogiques masquées pour l\'élève', () => {
  const contenu = fiche([
    createEmptyCoursBloc('titre_section', 't1'),
    definition(),
  ])

  it('prof : affiche les notes prof (bloc + globale)', () => {
    const out = md(contenu, 'professeur')
    expect(out).toContain('Insister sur le « je » lyrique')
    expect(out).toContain('Prévoir 2 séances')
  })

  it('élève : aucune note prof', () => {
    // La version élève passe par toStudentVersion (épure les notes)
    const studentContent = coursDefinition.toStudentVersion!(contenu) as CoursContenu
    const out = md(studentContent, 'eleve')
    expect(out).not.toContain('Insister sur le « je » lyrique')
    expect(out).not.toContain('Prévoir 2 séances')
    // Le contenu pédagogique reste présent
    expect(out).toContain('Lyrisme')
  })
})

describe('Markdown cours — rendu des types de blocs', () => {
  it('rend titre (##), définition (gras), citation (« »), liste (-)', () => {
    const contenu = fiche([
      createEmptyCoursBloc('titre_section', 't'),
      { ...createEmptyCoursBloc('citation', 'c'), texte: 'Demain dès l\'aube', auteur: 'Hugo' },
      { ...createEmptyCoursBloc('liste', 'l'), items: ['un', 'deux'] },
    ])
    contenu.blocs[0].texte = 'I. Introduction'
    const out = md(contenu, 'professeur')
    expect(out).toContain('## I. Introduction')
    expect(out).toContain('« Demain dès l\'aube »')
    expect(out).toContain('Hugo')
    expect(out).toContain('- un')
  })
})

// ── Création vierge ───────────────────────────────────────────────────────────

describe('buildBlankResourcePair — cours', () => {
  it('retourne une paire prof/élève valide (≥ 2 blocs)', () => {
    const paire = buildBlankResourcePair('cours', 'act-1')
    expect(paire.professeur.type).toBe('cours')
    expect(paire.eleve?.type).toBe('cours')
    const parsed = CoursContenuSchema.safeParse(paire.professeur.contenu_json)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.blocs.length).toBeGreaterThanOrEqual(2)
  })

  it('génère un Markdown non vide pour les deux versions', () => {
    const paire = buildBlankResourcePair('cours')
    expect(paire.professeur.contenu_markdown.length).toBeGreaterThan(0)
    expect(paire.eleve?.contenu_markdown.length).toBeGreaterThan(0)
  })
})
