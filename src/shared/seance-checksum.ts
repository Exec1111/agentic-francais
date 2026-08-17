/**
 * Checksum du contenu pédagogique d'une séance — détection de dérive de la
 * fiche de préparation (voir doc/fiche-preparation.md).
 *
 * La fiche fige un état de la séance au moment de sa génération : le checksum
 * est stocké dans son contenu (champ seance_checksum, injecté par postProcess).
 * Le frontend recalcule le checksum de la séance courante et signale toute
 * divergence (« Séance modifiée depuis la génération »).
 *
 * Module PARTAGÉ front + back : pas de dépendance Node (FNV-1a 32 bits suffit —
 * il s'agit de détecter une modification, pas de résister à une collision hostile).
 *
 * Champs couverts : uniquement ceux dont la modification invalide le déroulé
 * (titre, durée, mode, objectifs, et pour chaque activité : titre, type, durée,
 * consigne, phase). Les champs sans impact (corpus_status, ressources…) sont
 * exclus pour éviter les faux positifs.
 */

import type { Seance } from './schemas'

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // Multiplication par le premier FNV (16777619) en arithmétique 32 bits
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function computeSeanceChecksum(seance: Seance): string {
  const payload = JSON.stringify({
    titre: seance.titre,
    duree: seance.duree,
    mode: seance.mode_pedagogique ?? null,
    objectifs: seance.objectifs,
    activites: (seance.activites ?? []).map((a) => ({
      titre: a.titre,
      type: a.type,
      duree: a.duree,
      consigne: a.consigne,
      phase: a.phase ?? null,
    })),
  })
  return fnv1a32(payload)
}
