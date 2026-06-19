/**
 * Tests unitaires — nouveaux blocs : appariement, remise_en_ordre, classement.
 *
 * Couvre :
 *   1. Les helpers de schéma (createEmptyBloc, sanitizeBloc, stripBlocProf).
 *   2. Le rendu Markdown (fallback impression PDF) en versions prof ET élève :
 *      - le corrigé n'apparaît QUE pour le prof,
 *      - la numérotation des exercices est correcte.
 */

import { describe, it, expect } from 'vitest'
import { ficheQuestionsDefinition } from '../types/fiche-questions'
import {
  createEmptyBloc,
  sanitizeBloc,
  stripBlocProf,
  isExerciseBloc,
  type Bloc,
  type FicheQuestionsContenu,
} from '@/shared/resource-blocks'

// ── Fixtures ────────────────────────────────────────────────────────────────────

const baseFiche = (blocs: Bloc[]): FicheQuestionsContenu => ({
  objectif: 'Tester les nouveaux blocs',
  introduction: null,
  duree_estimee: null,
  blocs,
})

const appariement = (): Bloc => ({
  ...createEmptyBloc('appariement', 'a1'),
  question: 'Relie chaque mot à sa définition.',
  appariement_gauche: ['Métaphore', 'Comparaison'],
  appariement_droite: ['avec un outil de comparaison', 'sans outil de comparaison'],
  appariement_solution: [1, 0], // Métaphore → B, Comparaison → A
})

const remise = (): Bloc => ({
  ...createEmptyBloc('remise_en_ordre', 'r1'),
  question: 'Remets ces étapes dans l\'ordre.',
  remise_elements: ['Dénouement', 'Situation initiale', 'Péripéties'],
  remise_ordre: [1, 2, 0], // ordre correct : B → C → A
})

const classement = (): Bloc => ({
  ...createEmptyBloc('classement', 'c1'),
  question: 'Classe ces mots.',
  classement_categories: ['Nom', 'Verbe'],
  classement_items: ['chat', 'courir', 'maison'],
  classement_solution: [0, 1, 0],
})

const md = (fiche: FicheQuestionsContenu, audience: 'professeur' | 'eleve') =>
  ficheQuestionsDefinition.toMarkdown[audience]!(fiche as never)

// ── Helpers de schéma ─────────────────────────────────────────────────────────

describe('createEmptyBloc — nouveaux types', () => {
  it('appariement : initialise gauche/droite/solution', () => {
    const b = createEmptyBloc('appariement', 'x')
    expect(b.appariement_gauche).toEqual(['', ''])
    expect(b.appariement_droite).toEqual(['', ''])
    expect(b.appariement_solution).toEqual([0, 1])
  })

  it('remise_en_ordre : initialise éléments et ordre', () => {
    const b = createEmptyBloc('remise_en_ordre', 'x')
    expect(b.remise_elements).toHaveLength(3)
    expect(b.remise_ordre).toEqual([0, 1, 2])
  })

  it('classement : initialise catégories/items/solution', () => {
    const b = createEmptyBloc('classement', 'x')
    expect(b.classement_categories).toEqual(['', ''])
    expect(b.classement_solution).toEqual([0, 0])
  })

  it('les 3 nouveaux types sont des exercices numérotés', () => {
    expect(isExerciseBloc('appariement')).toBe(true)
    expect(isExerciseBloc('remise_en_ordre')).toBe(true)
    expect(isExerciseBloc('classement')).toBe(true)
  })
})

describe('sanitizeBloc — nouveaux types', () => {
  it('met à null les champs hors-type pollués par le LLM', () => {
    const pollue: Bloc = { ...appariement(), question: 'ok', enonce: 'NE DEVRAIT PAS RESTER', propositions: ['x'] }
    const clean = sanitizeBloc(pollue)
    expect(clean.enonce).toBeNull()
    expect(clean.propositions).toBeNull()
    // Les champs pertinents survivent
    expect(clean.appariement_gauche).toEqual(['Métaphore', 'Comparaison'])
    expect(clean.appariement_solution).toEqual([1, 0])
  })
})

describe('stripBlocProf — nouveaux corrigés masqués pour l\'élève', () => {
  it('retire appariement_solution, remise_ordre, classement_solution', () => {
    expect(stripBlocProf(appariement()).appariement_solution).toBeNull()
    expect(stripBlocProf(remise()).remise_ordre).toBeNull()
    expect(stripBlocProf(classement()).classement_solution).toBeNull()
  })
})

// ── Rendu Markdown / PDF ─────────────────────────────────────────────────────────

describe('Markdown appariement', () => {
  const fiche = baseFiche([appariement()])

  it('prof : affiche la solution (1 → B, 2 → A)', () => {
    const out = md(fiche, 'professeur')
    expect(out).toContain('Solution')
    expect(out).toContain('1 → B')
    expect(out).toContain('2 → A')
  })

  it('élève : pas de solution, mais les deux colonnes sont présentes', () => {
    const out = md(fiche, 'eleve')
    expect(out).not.toContain('Solution')
    expect(out).toContain('Métaphore')
    expect(out).toContain('sans outil de comparaison')
  })
})

describe('Markdown remise_en_ordre', () => {
  const fiche = baseFiche([remise()])

  it('prof : affiche l\'ordre correct (B → C → A)', () => {
    const out = md(fiche, 'professeur')
    expect(out).toContain('Ordre correct')
    expect(out).toContain('B → C → A')
  })

  it('élève : liste les éléments sans révéler l\'ordre', () => {
    const out = md(fiche, 'eleve')
    expect(out).not.toContain('Ordre correct')
    expect(out).toContain('Situation initiale')
  })
})

describe('Markdown classement', () => {
  const fiche = baseFiche([classement()])

  it('prof : place les items sous leur catégorie', () => {
    const out = md(fiche, 'professeur')
    // En-tête de tableau avec les catégories
    expect(out).toContain('| Nom | Verbe |')
    // "chat" et "maison" sont des noms ; "courir" un verbe
    expect(out).toContain('chat')
    expect(out).toContain('courir')
  })

  it('élève : affiche les étiquettes et un tableau vide', () => {
    const out = md(fiche, 'eleve')
    expect(out).toContain('Étiquettes')
    expect(out).toContain('| Nom | Verbe |')
  })
})

describe('Numérotation des exercices', () => {
  it('numérote appariement/remise/classement comme exercices', () => {
    const fiche = baseFiche([
      createEmptyBloc('consigne', 'k'),
      appariement(),
      remise(),
      classement(),
    ])
    const out = md(fiche, 'eleve')
    expect(out).toContain('**1.**')
    expect(out).toContain('**2.**')
    expect(out).toContain('**3.**')
  })
})
