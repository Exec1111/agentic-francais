/**
 * Tests unitaires — exerciceDefinition.buildPrompt
 *
 * Trois familles de cas :
 *   A. Aucun corpus → pas de bloc corpus dans le prompt
 *   B. Corpus avec contenu disponible (domaine public) → injection du texte intégral
 *   C. Corpus protégé (contenu vide) → référence bibliographique uniquement
 */

import { describe, it, expect } from 'vitest'
import { ficheQuestionsDefinition as exerciceDefinition } from '../types/fiche-questions'
import type { ResourceGenerationContext } from '../registry'
import type { CorpusItem } from '@/shared/schemas'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeCorpusItem = (overrides: Partial<CorpusItem> = {}): CorpusItem => ({
  id: 'proust-madeleine',
  type: 'extrait',
  auteur: 'Marcel Proust',
  oeuvre: 'À la recherche du temps perdu',
  titre: 'La Madeleine',
  annee_publication: 1913,
  edition_reference: 'Gallimard, Folio Classique, 2007',
  pages: 'p. 44-47',
  contenu: 'Longtemps, je me suis couché de bonne heure. Parfois, à peine ma bougie éteinte…',
  checksum: 'abc123',
  niveaux: ['premiere', 'terminale'],
  genres: ['roman', 'autobiographie'],
  themes: ['mémoire', 'enfance', 'temps'],
  domaine_public: true,
  verified: true,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  ...overrides,
})

const makeContext = (corpusItem?: CorpusItem | null): ResourceGenerationContext => ({
  sequenceTitle: 'La Mémoire dans la littérature',
  niveau: 'Première',
  theme: 'Mémoire et identité',
  seanceNumero: 3,
  seanceTitle: 'Lecture de Proust',
  activiteTitre: 'Exercices de compréhension',
  activiteType: 'exercice',
  activiteConsigne: 'Analyser les sensations et la mémoire involontaire',
  ressourceTitre: 'Fiche d\'exercices — La Madeleine',
  corpusItem,
})

// Extrait le contenu du message système (index 0)
const systemMsg = (msgs: ReturnType<typeof exerciceDefinition.buildPrompt>) =>
  msgs[0].content as string

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exerciceDefinition.buildPrompt — cas A : aucun corpus', () => {
  it('ne contient ni bloc TEXTE SOURCE ni RÉFÉRENCE BIBLIOGRAPHIQUE', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext()))
    expect(system).not.toContain('TEXTE SOURCE')
    expect(system).not.toContain('RÉFÉRENCE BIBLIOGRAPHIQUE')
  })

  it('contient bien le contexte pédagogique (séquence, niveau, thème)', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext()))
    expect(system).toContain('La Mémoire dans la littérature')
    expect(system).toContain('Première')
    expect(system).toContain('Mémoire et identité')
  })

  it('retourne exactement 2 messages (system + user)', () => {
    expect(exerciceDefinition.buildPrompt(makeContext())).toHaveLength(2)
  })
})

describe('exerciceDefinition.buildPrompt — cas B : corpus avec contenu disponible', () => {
  const item = makeCorpusItem()

  it('injecte le texte source intégral dans le prompt système', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(item)))
    expect(system).toContain('TEXTE SOURCE')
    expect(system).toContain('Longtemps, je me suis couché de bonne heure')
  })

  it('inclut les métadonnées bibliographiques (auteur, œuvre, pages)', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(item)))
    expect(system).toContain('Marcel Proust')
    expect(system).toContain('À la recherche du temps perdu')
    expect(system).toContain('p. 44-47')
    expect(system).toContain('Gallimard, Folio Classique, 2007')
  })

  it('exige la citation mot pour mot', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(item)))
    expect(system).toContain('mot pour mot')
  })

  it("ne mentionne pas de droits d'auteur ni de texte protégé", () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(item)))
    expect(system).not.toContain("droits d'auteur")
    expect(system).not.toContain('protégé')
    expect(system).not.toContain('non reproduit')
  })

  it('fonctionne aussi sans le champ pages (item sans pages)', () => {
    const itemSansPages = makeCorpusItem({ pages: undefined })
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(itemSansPages)))
    // La ligne Référence ne doit pas contenir "undefined"
    expect(system).not.toContain('undefined')
    expect(system).toContain('TEXTE SOURCE')
  })
})

describe("exerciceDefinition.buildPrompt — cas C : corpus protégé (contenu vide)", () => {
  const protectedItem = makeCorpusItem({ contenu: '' })

  it('injecte une référence bibliographique (pas le texte)', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('RÉFÉRENCE BIBLIOGRAPHIQUE')
    expect(system).not.toContain('TEXTE SOURCE OFFICIEL')
  })

  it('inclut les métadonnées de l\'œuvre protégée', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('Marcel Proust')
    expect(system).toContain('À la recherche du temps perdu')
    expect(system).toContain('p. 44-47')
  })

  it("mentionne explicitement les droits d'auteur", () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain("droits d'auteur")
  })

  it('guide le LLM vers des exercices analytiques sans citation verbatim', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('sans citer')
  })

  it('précise que les élèves auront le texte en main', () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(protectedItem)))
    expect(system).toContain('en main')
  })

  it("ne contient pas le contenu vide comme texte littéral (pas de ligne blanche orpheline)", () => {
    const system = systemMsg(exerciceDefinition.buildPrompt(makeContext(protectedItem)))
    // Vérifie que le contenu vide n'est pas injecté entre les séparateurs ━━━
    // (présence des séparateurs sans texte intermédiaire inattendu)
    expect(system).not.toMatch(/━+\n\n━+/)
  })
})
