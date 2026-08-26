// OpenCode connection tutorial tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

test("OpenCode tutorial is defined in AgentSetupCard.vue", () => {
  const src = readFileSync(new URL("../components/AgentSetupCard.vue", import.meta.url), "utf8");

  // LocalServiceId contains opencode
  assert.ok(src.includes('"opencode"'), "LocalServiceId must include opencode");

  // OpenCode is placed first before Codex in localServices
  const opencodeIdx = src.indexOf('{ id: "opencode"');
  const codexIdx = src.indexOf('{ id: "codex"');
  assert.ok(opencodeIdx !== -1, "opencode must exist in localServices");
  assert.ok(codexIdx !== -1, "codex must exist in localServices");
  assert.ok(opencodeIdx < codexIdx, "opencode must appear before codex in localServices");

  // OpencodeLogo is imported
  assert.ok(src.includes('import OpencodeLogo from "../assets/logoai/Ailocal/Opencode.png";'));

  // Default selected service for local is opencode
  assert.ok(src.includes('ref<ServiceId>("opencode")'));

  // OpenCode tutorial steps configuration
  assert.ok(src.includes("opencode: {"), "opencode steps config must exist");
  assert.ok(src.includes('"OpenCode CLI Setup Tutorial"'));

  // Step 1: Activate the MCP Server
  assert.ok(src.includes("curl -s ${base}/health"));

  // Step 2: Install OpenCode CLI
  assert.ok(src.includes('"Install OpenCode CLI"'));
  assert.ok(src.includes('"opencode --version"'));
  assert.ok(src.includes("npm install -g opencode-ai"));

  // Step 3: Register AIConnect MCP Server
  assert.ok(src.includes('"Register AIConnect MCP Server"'));
  assert.ok(src.includes('"opencode mcp add"'));
  assert.ok(src.includes("remote"));

  // Step 4: Verify MCP Connection
  assert.ok(src.includes('"Verify MCP Connection"'));
  assert.ok(src.includes('"opencode mcp list"'));

  // Step 5: Run an AI CONNECT Prompt
  assert.ok(src.includes('"Run an AI CONNECT Prompt"'));
  assert.ok(src.includes('command: "opencode"'));

  // Codex tutorial still preserved
  assert.ok(src.includes("codex: {"), "codex tutorial must still be preserved");
  assert.ok(src.includes('"Codex CLI & IDE Setup Tutorial"'));
  assert.ok(src.includes('"codex mcp list"'));
});

test("stepper navigation logic for a 5-step tutorial", () => {
  let step = 1;
  const totalSteps = 5;

  const prevStep = () => {
    if (step > 1) step -= 1;
  };
  const nextStep = () => {
    if (step < totalSteps) step += 1;
  };
  const goToStep = (s: number) => {
    if (s >= 1 && s <= totalSteps) step = s;
  };

  assert.equal(step, 1);
  prevStep(); // clamps at 1
  assert.equal(step, 1);

  nextStep(); // 2
  assert.equal(step, 2);
  nextStep(); // 3
  assert.equal(step, 3);
  nextStep(); // 4
  assert.equal(step, 4);
  nextStep(); // 5
  assert.equal(step, 5);
  nextStep(); // clamps at 5
  assert.equal(step, 5);

  prevStep(); // 4
  assert.equal(step, 4);

  goToStep(2);
  assert.equal(step, 2);
  goToStep(99); // invalid step ignored
  assert.equal(step, 2);
  goToStep(0); // invalid step ignored
  assert.equal(step, 2);
});

