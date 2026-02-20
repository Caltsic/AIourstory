import type { DiceResult } from "./story-store";

// 测试模式：固定骰子点数
let _testDiceValue: number | null = null;

/** 设置测试模式固定骰子点数（null 为关闭） */
export function setTestDiceValue(value: number | null) {
  _testDiceValue = value;
}

/** 获取当前测试骰子值（null 表示未激活） */
export function getTestDiceValue(): number | null {
  return _testDiceValue;
}

/** Roll an 8-sided die (1-8) */
export function rollDice(): number {
  if (_testDiceValue !== null) return _testDiceValue;
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
