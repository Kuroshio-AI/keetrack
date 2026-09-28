import assert from "node:assert/strict";
import test from "node:test";
import { commitState, loadState } from "./storage";
import { createInitialState } from "./domain";

test("storage load offers recovery for malformed or unsupported data", () => {
  const result = loadState({ getItem: () => "{nope" }, "2026-01-01" as never);
  assert.equal(result.recovered, true);
  assert.equal(result.state.records.length, 0);
});

test("storage commit is atomic from the caller's perspective", () => {
  const state = createInitialState("2026-01-01");
  let writes = 0;
  const result = commitState({ setItem: () => { writes += 1; throw new Error("quota"); } }, state);
  assert.equal(result.ok, false);
  assert.equal(writes, 1);
  assert.equal(state.records.length, 0);
});

test("storage rejects malformed nested records instead of loading them", () => {
  const state = createInitialState("2026-01-01");
  const malformed = { ...state, records: [{ id: "asset-1", assetRef: "A-1", recordType: "equipment", assetType: "Anchor", site: "Site", owner: "Owner", status: "Active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), inspectionDueDate: "not-a-date", certificates: [], activity: ["broken"] }] };
  const result = loadState({ getItem: () => JSON.stringify(malformed) }, "2026-01-01");
  assert.equal(result.recovered, true);
});

test("storage rejects malformed alert email timestamps", () => {
  const state = createInitialState("2026-01-01");
  const malformed = {
    ...state,
    alerts: [{
      id: "alert-1",
      occurrenceKey: "system:1",
      type: "system" as const,
      event: "System notice",
      timestamp: "2026-01-01T00:00:00.000Z",
      severity: "info" as const,
      status: "history" as const,
      emailSentAt: "not-a-timestamp",
    }],
  };
  const result = loadState({ getItem: () => JSON.stringify(malformed) }, "2026-01-01");
  assert.equal(result.recovered, true);
});

test("storage rejects malformed alert WhatsApp timestamps", () => {
  const state = createInitialState("2026-01-01");
  const malformed = {
    ...state,
    alerts: [{
      id: "alert-1",
      occurrenceKey: "system:1",
      type: "system" as const,
      event: "System notice",
      timestamp: "2026-01-01T00:00:00.000Z",
      severity: "info" as const,
      status: "history" as const,
      whatsappSentAt: "not-a-timestamp",
    }],
  };
  const result = loadState({ getItem: () => JSON.stringify(malformed) }, "2026-01-01");
  assert.equal(result.recovered, true);
});
