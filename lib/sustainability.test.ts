import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, parseSaving, quarterLabel, quarterOf, quarterRange, removeSaving, saveSaving, savingKg, totalKg, validateStoredState } from "./domain";

const paper = { type: "paper", date: "2026-09-18", quantity: 560, factor: 0.94, evidence: "Endoshred certificate SO/0926/19305" };
const at = "2026-10-12T08:00:00.000Z";

test("typed-in savings are validated and blank optional fields dropped", () => {
  assert.match(parseSaving({ ...paper, quantity: 0 }).error ?? "", /Quantity/);
  assert.match(parseSaving({ ...paper, date: "2026-02-30" }).error ?? "", /Date/);
  assert.match(parseSaving({ ...paper, type: "other" }).error ?? "", /Unit/, "Other needs its own unit");
  assert.match(parseSaving({ ...paper, description: "<b>paper</b>" }).error ?? "", /160/);
  assert.match(parseSaving({ ...paper, type: "toString" }).error ?? "", /type/);
  const saving = parseSaving({ ...paper, unit: "tonnes", site: "  " }).saving!;
  assert.equal(saving.unit, "kg", "fixed types keep their own unit");
  assert.equal(saving.site, undefined);
  assert.equal(parseSaving({ ...paper, type: "other", unit: " kWh " }).saving?.unit, "kWh");
});

test("CO₂e is quantity × factor, matching the Q3 deck", () => {
  assert.equal(savingKg({ quantity: 560, factor: 0.94 }), 526.4);
  assert.equal(savingKg({ quantity: 29, factor: 2.1752 }), 63.081);
  assert.equal(quarterOf("2026-09-18"), "2026-Q3");
  assert.equal(quarterOf("2026-10-01"), "2026-Q4");
  assert.equal(quarterLabel("2026-Q3"), "Q3 2026");
  assert.deepEqual(quarterRange("2026-Q4"), ["2026-10-01", "2026-12-31"]);
});

test("certificate numbers run per year, survive edits and are never reused", () => {
  const input = parseSaving(paper).saving!;
  let state = saveSaving(createInitialState("2026-10-12"), input, undefined, "Admin", at);
  state = saveSaving(state, { ...input, type: "pallets", unit: "pallets", quantity: 29, factor: 2.1752 }, undefined, "Admin", at);
  assert.deepEqual(state.savings?.map((saving) => saving.number), ["ENV-2026-002", "ENV-2026-001"]);
  assert.equal(totalKg(state.savings!), 589.481);

  const first = state.savings!.find((saving) => saving.number === "ENV-2026-001")!;
  state = saveSaving(state, { ...input, quantity: 600, evidence: undefined }, first.id, "Admin", at);
  const edited = state.savings!.find((saving) => saving.id === first.id)!;
  assert.equal(edited.number, "ENV-2026-001");
  assert.equal(edited.evidence, undefined, "a cleared optional field is removed on edit");

  state = removeSaving(state, state.savings!.find((saving) => saving.number === "ENV-2026-002")!.id);
  state = saveSaving(state, input, undefined, "Admin", at);
  assert.equal(state.savings![0].number, "ENV-2026-003");
  assert.equal(saveSaving({ ...state, demoDate: "2027-01-04" }, input, undefined, "Admin", at).savings![0].number, "ENV-2027-001");
  assert.equal(state.activity[0].event, "Saving recorded");

  assert.ok(validateStoredState(state));
  assert.ok(validateStoredState(createInitialState("2026-10-12")), "workspaces from before Sustainability stay valid");
  assert.equal(validateStoredState({ ...state, savings: [{ ...state.savings![0], quantity: -1 }] }), false);
  assert.equal(validateStoredState({ ...state, savingCounters: { 2026: "3" } }), false);
});
