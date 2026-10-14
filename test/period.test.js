import { test } from "node:test";
import assert from "node:assert/strict";
import { monthOf } from "../server/domain.js";
test("Competência respeita datas civis e fuso de São Paulo em viradas de mês", () => {
  assert.equal(monthOf("2026-10-01"), "2026-10");
  assert.equal(monthOf("2026-10-01T01:30:00.000Z"), "2026-09");
  assert.equal(monthOf("2026-10-01T03:30:00.000Z"), "2026-10");
});
