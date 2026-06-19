/**
 * Tests unitaires — types `fiche_methode` et `bilan` (famille blocs de contenu).
 *
 * Couvre :
 *   - Rendu Markdown prof vs élève : notes prof + remédiation masquées pour l'élève.
 *   - Numérotation des étapes (méthode).
 *   - Création vierge via buildBlankResourcePair.
 */

import { describe, it, expect } from 'vitest'
import { ficheMethodeDefinition } from '../types/methode'
import { bilanDefinition } from '../types/bilan'
import { buildBlankResourcePair } from '../generator'
import {
  createEmptyMethodeBloc,
  MethodeContenuSchema,
  type MethodeBloc,
  type MethodeContenu,
} from '@/shared/resource-blocks-methode'
import {
  createEmptyBilanBloc,
  BilanContenuSchema,
  type BilanBloc,
  type BilanContenu,
} from '@/shared/resource-blocks-bilan'

// ── fiche_methode ───────────────────────────────────────────────────────────────

const methodeMd = (c: MethodeContenu, a: 'professeur' | 'eleve') =>
  ficheMethodeDefinition.toMarkdown[a]!(c as never)

const etape = (titre: string, note?: string): MethodeBloc => ({
  ...createEmptyMethodeBloc('etape', `e-${titre}`),
  titre,
  texte: `Description ${titre}`,
  note_prof: note ?? null,
})

describe('fiche_methode — Markdown', () => {
  const contenu: MethodeContenu = {
    titre: 'Rédiger un paragraphe',
    objectif: null,
    note_prof_globale: 'À distribuer avant l\'exercice.',
    blocs: [etape('Annoncer', 'Bien insister ici.'), etape('Justifier')],
  }

  it('numérote les étapes (Étape 1, Étape 2)', () => {
    const out = methodeMd(contenu, 'eleve')
    expect(out).toContain('Étape 1')
    expect(out).toContain('Étape 2')
  })

  it('prof : affiche les notes prof', () => {
    const out = methodeMd(contenu, 'professeur')
    expect(out).toContain('Bien insister ici')
    expect(out).toContain('À distribuer avant')
  })

  it('élève : aucune note prof', () => {
    const student = ficheMethodeDefinition.toStudentVersion!(contenu) as MethodeContenu
    const out = methodeMd(student, 'eleve')
    expect(out).not.toContain('Bien insister ici')
    expect(out).not.toContain('À distribuer avant')
    expect(out).toContain('Annoncer')
  })
})

describe('buildBlankResourcePair — fiche_methode', () => {
  it('paire valide (≥ 2 blocs) + markdown non vide', () => {
    const paire = buildBlankResourcePair('fiche_methode', 'act-1')
    expect(paire.professeur.type).toBe('fiche_methode')
    const parsed = MethodeContenuSchema.safeParse(paire.professeur.contenu_json)
    expect(parsed.success).toBe(true)
    expect(paire.eleve?.contenu_markdown.length).toBeGreaterThan(0)
  })
})

// ── bilan ───────────────────────────────────────────────────────────────────────

const bilanMd = (c: BilanContenu, a: 'professeur' | 'eleve') =>
  bilanDefinition.toMarkdown[a]!(c as never)

const checklist = (): BilanBloc => ({
  ...createEmptyBilanBloc('checklist', 'c1'),
  texte: 'Coche ce que tu sais :',
  checklist_items: ['Je sais reconnaître le lyrisme', 'Je sais analyser une métaphore'],
  checklist_remediation: ['Revoir la fiche registres', 'Refaire l\'exercice 3'],
})

describe('bilan — Markdown checklist', () => {
  const contenu: BilanContenu = {
    titre: 'Bilan lyrisme',
    introduction: null,
    note_prof_globale: null,
    blocs: [checklist()],
  }

  it('rend les énoncés en cases à cocher (- [ ])', () => {
    const out = bilanMd(contenu, 'eleve')
    expect(out).toContain('- [ ] Je sais reconnaître le lyrisme')
  })

  it('prof : affiche la remédiation', () => {
    const out = bilanMd(contenu, 'professeur')
    expect(out).toContain('Revoir la fiche registres')
  })

  it('élève : pas de remédiation', () => {
    const student = bilanDefinition.toStudentVersion!(contenu) as BilanContenu
    const out = bilanMd(student, 'eleve')
    expect(out).not.toContain('Revoir la fiche registres')
    // L'énoncé reste présent
    expect(out).toContain('Je sais analyser une métaphore')
  })
})

describe('buildBlankResourcePair — bilan', () => {
  it('paire valide (≥ 2 blocs) + markdown non vide', () => {
    const paire = buildBlankResourcePair('bilan', 'act-1')
    expect(paire.professeur.type).toBe('bilan')
    const parsed = BilanContenuSchema.safeParse(paire.professeur.contenu_json)
    expect(parsed.success).toBe(true)
    expect(paire.eleve?.contenu_markdown.length).toBeGreaterThan(0)
  })
})
