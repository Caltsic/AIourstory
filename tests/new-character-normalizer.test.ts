import { describe, expect, it, vi } from "vitest";

import { normalizeLLMNewCharacters } from "../lib/new-character-normalizer";

describe("new-character-normalizer", () => {
  it("returns empty array and warns when payload is not an array", () => {
    const warn = vi.fn();
    const result = normalizeLLMNewCharacters({ bad: true }, warn);

    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("not an array");
  });

  it("drops items without name and keeps valid ones", () => {
    const warn = vi.fn();
    const result = normalizeLLMNewCharacters(
      [
        { gender: "f" },
        { name: "  Iris  ", gender: "f", personality: "quiet", background: "test" },
      ],
      warn,
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Iris");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("missing required field: name");
  });

  it("fills missing optional profile fields with defaults", () => {
    const warn = vi.fn();
    const result = normalizeLLMNewCharacters([{ name: "Nora" }], warn);

    expect(result).toEqual([
      {
        name: "Nora",
        hiddenName: "陌生人",
        knownToPlayer: true,
        gender: "未知",
        personality: "待补充",
        background: "待补充",
        appearance: "",
      },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("default values applied");
  });

  it("preserves provided fields and knownToPlayer flag", () => {
    const warn = vi.fn();
    const result = normalizeLLMNewCharacters(
      [
        {
          name: "Rin",
          hiddenName: "红发旅人",
          knownToPlayer: false,
          gender: "女",
          personality: "果断",
          background: "来自北境",
          appearance: "red hair",
        },
      ],
      warn,
    );

    expect(result[0]).toEqual({
      name: "Rin",
      hiddenName: "红发旅人",
      knownToPlayer: false,
      gender: "女",
      personality: "果断",
      background: "来自北境",
      appearance: "red hair",
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
