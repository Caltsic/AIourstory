import type { DiceResult } from "./story-store";

/** Roll an 8-sided die (1-8) */
export function rollDice(): number {
  return Math.floor(Math.random() * 8) + 1;
}

/** Compare dice roll against judgment value and determine outcome */
export function evaluateDiceResult(
  roll: number,
  judgmentValue: number
): DiceResult {
  let outcome: DiceResult["outcome"];
  if (roll < judgmentValue) outcome = "worse";
  else if (roll === judgmentValue) outcome = "exact";
  else outcome = "better";

  return { roll, judgmentValue, outcome };
}
