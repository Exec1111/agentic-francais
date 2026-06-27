/**
 * Métadonnées UI des profils de différenciation, partagées frontend ⇄ backend.
 *
 * Ce fichier ne contient AUCUNE dépendance serveur : il est importable côté client
 * (ResourcePanel, impression) comme côté serveur (génération). Les règles de prompt
 * (texte d'instruction LLM) vivent dans backend/resources/differentiation.ts.
 */

import type { DifferentiationProfil } from './schemas'

/** Indices de rendu pour l'impression/PDF (profils dys & allophone). */
export interface ProfilRenderHints {
  /** Pile de polices CSS. */
  fontFamily: string
  /** Interlignage. */
  lineHeight: number
  /** Espacement des lettres (CSS letter-spacing). */
  letterSpacing?: string
  /** Espacement des mots (CSS word-spacing). */
  wordSpacing?: string
}

export interface ProfilUI {
  id: Exclude<DifferentiationProfil, 'standard'>
  /** Libellé court affiché dans l'UI. */
  label: string
  /** Description d'une ligne (public visé). */
  description: string
  /** Emoji d'accroche. */
  emoji: string
  /** Indices de rendu (police adaptée). Absent = rendu standard. */
  render?: ProfilRenderHints
}

export const PROFIL_UI: Record<Exclude<DifferentiationProfil, 'standard'>, ProfilUI> = {
  allegee: {
    id: 'allegee',
    label: 'Allégée',
    description: 'Élèves en difficulté — étayage et simplification',
    emoji: '🪶',
  },
  enrichie: {
    id: 'enrichie',
    label: 'Enrichie',
    description: 'Élèves rapides — approfondissement',
    emoji: '🚀',
  },
  dys: {
    id: 'dys',
    label: 'Dys',
    description: 'Troubles dys — phrases courtes, lexique simple, police adaptée',
    emoji: '🔤',
    render: {
      fontFamily: "'OpenDyslexic', 'Comic Sans MS', 'Verdana', 'Arial', sans-serif",
      lineHeight: 2.0,
      letterSpacing: '0.06em',
      wordSpacing: '0.16em',
    },
  },
  allophone: {
    id: 'allophone',
    label: 'Allophone',
    description: 'Élèves allophones — reformulations et glossaire enrichi',
    emoji: '🌍',
    render: {
      fontFamily: "'Verdana', 'Arial', sans-serif",
      lineHeight: 1.9,
      letterSpacing: '0.02em',
    },
  },
}

/** Liste ordonnée des profils différenciables (hors 'standard'). */
export const PROFIL_UI_LIST: ProfilUI[] = Object.values(PROFIL_UI)

/**
 * Profils actifs par défaut quand la séquence n'a défini aucune préférence :
 * différenciation « par niveau » uniquement (allégée + enrichie), quasi universelle.
 * Les profils dys/allophone sont opt-in (le prof les active selon sa classe).
 */
export const DEFAULT_ACTIVE_PROFILS: Exclude<DifferentiationProfil, 'standard'>[] = ['allegee', 'enrichie']

/** Récupère les métadonnées UI d'un profil. undefined pour 'standard' ou inconnu. */
export function getProfilUI(profil: DifferentiationProfil): ProfilUI | undefined {
  if (profil === 'standard') return undefined
  return PROFIL_UI[profil]
}

/**
 * Résout les profils différenciables actifs d'une séquence (préférences « classe »).
 *  - `stored === undefined` → différenciation par niveau (DEFAULT_ACTIVE_PROFILS).
 *  - `stored === []`        → aucun profil (le prof a tout désactivé).
 *  - sinon                  → les profils listés (hors 'standard', dans l'ordre canonique).
 */
export function resolveActiveProfils(stored?: DifferentiationProfil[]): ProfilUI[] {
  const ids = stored === undefined ? DEFAULT_ACTIVE_PROFILS : stored
  const set = new Set(ids)
  return PROFIL_UI_LIST.filter((p) => set.has(p.id))
}
