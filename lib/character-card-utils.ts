import type { CharacterCard } from "./story-store";

const GENERIC_ALIAS_PATTERNS: RegExp[] = [
  /^陌生(?:人|男人|女人|少年|少女)?$/,
  /^神秘(?:人|男人|女人)?$/,
  /^未知(?:人物|男人|女人|来客)?$/,
  /^路人(?:甲|乙|丙|丁)?$/,
  /^男人$/,
  /^女人$/,
  /^少年$/,
  /^少女$/,
  /^来客$/,
  /^客人$/,
  /^黑影$/,
  /^身影$/,
  /^无名者$/,
  /^可疑人物$/,
];

export function normalizeCharacterNameKey(value?: string): string {
  return (value ?? "").trim().replace(/\s+/g, "");
}

export function isGenericCharacterAlias(value?: string): boolean {
  const normalized = normalizeCharacterNameKey(value);
  if (!normalized) return true;
  return GENERIC_ALIAS_PATTERNS.some((rule) => rule.test(normalized));
}

export type CharacterCardMatchReason = "exact-name" | "hidden-alias" | "none";

export interface CharacterCardMatchResult {
  match: CharacterCard | null;
  reason: CharacterCardMatchReason;
  aliasConflict: boolean;
  aliasCandidates: string[];
}

export function resolveExistingCharacterCardForIncoming(
  cards: CharacterCard[],
  incomingName: string,
  incomingHiddenName: string,
): CharacterCardMatchResult {
  const nameKey = normalizeCharacterNameKey(incomingName);
  const hiddenKey = normalizeCharacterNameKey(incomingHiddenName);

  if (!nameKey) {
    return {
      match: null,
      reason: "none",
      aliasConflict: false,
      aliasCandidates: [],
    };
  }

  const exact = cards.find(
    (card) => normalizeCharacterNameKey(card.name) === nameKey,
  );
  if (exact) {
    return {
      match: exact,
      reason: "exact-name",
      aliasConflict: false,
      aliasCandidates: [],
    };
  }

  if (!hiddenKey || isGenericCharacterAlias(hiddenKey)) {
    return {
      match: null,
      reason: "none",
      aliasConflict: false,
      aliasCandidates: [],
    };
  }

  const aliasMatches = cards.filter(
    (card) =>
      !card.isNameRevealed &&
      (normalizeCharacterNameKey(card.hiddenName) === hiddenKey ||
        normalizeCharacterNameKey(card.name) === hiddenKey),
  );

  if (aliasMatches.length === 1) {
    return {
      match: aliasMatches[0],
      reason: "hidden-alias",
      aliasConflict: false,
      aliasCandidates: [],
    };
  }

  if (aliasMatches.length > 1) {
    return {
      match: null,
      reason: "none",
      aliasConflict: true,
      aliasCandidates: aliasMatches.map((card) => card.name),
    };
  }

  return {
    match: null,
    reason: "none",
    aliasConflict: false,
    aliasCandidates: [],
  };
}
