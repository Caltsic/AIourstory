import { describe, expect, it } from "vitest";

import type { CharacterCard } from "../lib/story-store";
import {
  isGenericCharacterAlias,
  normalizeCharacterNameKey,
  resolveExistingCharacterCardForIncoming,
} from "../lib/character-card-utils";

function makeCard(partial: Partial<CharacterCard>): CharacterCard {
  return {
    id: partial.id ?? "card-1",
    name: partial.name ?? "Alice",
    hiddenName: partial.hiddenName ?? "Alias",
    isNameRevealed: partial.isNameRevealed ?? false,
    gender: partial.gender ?? "unknown",
    personality: partial.personality ?? "calm",
    background: partial.background ?? "n/a",
    appearance: partial.appearance ?? "",
    affinity: partial.affinity ?? 0,
    firstAppearance: partial.firstAppearance ?? 0,
  };
}

describe("character-card-utils", () => {
  it("normalizes keys by trimming and removing inner spaces", () => {
    expect(normalizeCharacterNameKey("  A li ce  ")).toBe("Alice");
    expect(normalizeCharacterNameKey("")).toBe("");
  });

  it("treats generic aliases as generic", () => {
    expect(isGenericCharacterAlias("陌生人")).toBe(true);
    expect(isGenericCharacterAlias("  神秘人  ")).toBe(true);
    expect(isGenericCharacterAlias("夜巡者")).toBe(false);
  });

  it("matches exact real name first", () => {
    const cards = [makeCard({ id: "1", name: "Lin" })];
    const result = resolveExistingCharacterCardForIncoming(
      cards,
      "Lin",
      "陌生人",
    );

    expect(result.match?.id).toBe("1");
    expect(result.reason).toBe("exact-name");
    expect(result.aliasConflict).toBe(false);
  });

  it("does not merge by generic hidden alias", () => {
    const cards = [
      makeCard({ id: "1", name: "A", hiddenName: "陌生人", isNameRevealed: false }),
    ];
    const result = resolveExistingCharacterCardForIncoming(
      cards,
      "B",
      "陌生人",
    );

    expect(result.match).toBeNull();
    expect(result.reason).toBe("none");
    expect(result.aliasConflict).toBe(false);
  });

  it("matches by hidden alias when alias is specific and unique", () => {
    const cards = [
      makeCard({ id: "1", name: "A", hiddenName: "黑伞人", isNameRevealed: false }),
      makeCard({ id: "2", name: "B", hiddenName: "陌生人", isNameRevealed: false }),
    ];
    const result = resolveExistingCharacterCardForIncoming(
      cards,
      "C",
      "黑伞人",
    );

    expect(result.match?.id).toBe("1");
    expect(result.reason).toBe("hidden-alias");
    expect(result.aliasConflict).toBe(false);
  });

  it("reports alias conflict when multiple cards share same specific alias", () => {
    const cards = [
      makeCard({ id: "1", name: "A", hiddenName: "守门人", isNameRevealed: false }),
      makeCard({ id: "2", name: "B", hiddenName: "守门人", isNameRevealed: false }),
    ];
    const result = resolveExistingCharacterCardForIncoming(
      cards,
      "C",
      "守门人",
    );

    expect(result.match).toBeNull();
    expect(result.aliasConflict).toBe(true);
    expect(result.aliasCandidates).toEqual(["A", "B"]);
  });
});
