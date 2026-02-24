export interface NormalizedNewCharacterData {
  name: string;
  hiddenName?: string;
  knownToPlayer?: boolean;
  gender: string;
  personality: string;
  background: string;
  appearance?: string;
}

type WarnFn = (message: string) => void;

function normalizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeLLMNewCharacters(
  rawNewCharacters: unknown,
  onWarn?: WarnFn,
): NormalizedNewCharacterData[] {
  if (!Array.isArray(rawNewCharacters)) {
    if (rawNewCharacters != null) {
      onWarn?.("newCharacters payload is not an array, ignored");
    }
    return [];
  }

  const normalized: NormalizedNewCharacterData[] = [];

  for (let index = 0; index < rawNewCharacters.length; index += 1) {
    const item = rawNewCharacters[index] as Record<string, unknown> | null;
    const name = normalizeOptionalText(item?.name);
    if (!name) {
      onWarn?.(`newCharacters[${index}] missing required field: name, dropped`);
      continue;
    }

    const hiddenName = normalizeOptionalText(item?.hiddenName) || "陌生人";
    const gender = normalizeOptionalText(item?.gender);
    const personality = normalizeOptionalText(item?.personality);
    const background = normalizeOptionalText(item?.background);
    const appearance = normalizeOptionalText(item?.appearance);
    const knownToPlayer =
      typeof item?.knownToPlayer === "boolean" ? item.knownToPlayer : true;

    const missingFields: string[] = [];
    if (!gender) missingFields.push("gender");
    if (!personality) missingFields.push("personality");
    if (!background) missingFields.push("background");

    if (missingFields.length > 0) {
      onWarn?.(
        `newCharacters[${index}] name="${name}" missing optional fields: ${missingFields.join(", ")}; default values applied`,
      );
    }

    normalized.push({
      name,
      hiddenName,
      knownToPlayer,
      gender: gender || "未知",
      personality: personality || "待补充",
      background: background || "待补充",
      appearance: appearance || "",
    });
  }

  return normalized;
}
