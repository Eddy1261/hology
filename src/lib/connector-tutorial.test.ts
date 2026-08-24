// Test connector tutorial rendering and markdown parsing contract

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { marked } from "marked";

test("marked parses TUTORIAL.md markdown with tables, headers, and code", () => {
  const markdown = `# Office Connection Setup Guide

## 1. Prerequisites
- Microsoft Office installed
- Windows with COM automation enabled

## 2. Tools

| Tool | What it does |
|------|-------------|
| Launch | Start app |
| Quit | Close app |

\`\`\`python
# sample prompt
run_office_command()
\`\`\`
`;

  const html = marked.parse(markdown, { gfm: true, breaks: true }) as string;

  assert.ok(html.includes("<h1"), "must contain h1 header");
  assert.ok(html.includes("Office Connection Setup Guide"), "must include title");
  assert.ok(html.includes("<table"), "must render markdown table");
  assert.ok(html.includes("<pre><code"), "must render code fence");
  assert.ok(html.includes("run_office_command()"), "must preserve code contents");
});

test("MCPGuide imports gatewayConnectorTutorial and MarkdownView", () => {
  const guideSrc = readFileSync(new URL("../pages/MCPGuide.vue", import.meta.url), "utf8");
  assert.ok(
    guideSrc.includes("gatewayConnectorTutorial"),
    "MCPGuide must import and invoke gatewayConnectorTutorial",
  );
  assert.ok(
    guideSrc.includes("MarkdownView"),
    "MCPGuide must import and render MarkdownView",
  );
  assert.ok(
    guideSrc.includes("loadTutorial"),
    "MCPGuide must define loadTutorial",
  );
});

test("gateway.ts exports gatewayConnectorTutorial calling /internal/connectors/{id}/tutorial", () => {
  const gatewaySrc = readFileSync(new URL("./gateway.ts", import.meta.url), "utf8");
  assert.ok(
    gatewaySrc.includes("export async function gatewayConnectorTutorial"),
    "gateway.ts must export gatewayConnectorTutorial",
  );
  assert.ok(
    gatewaySrc.includes("/internal/connectors/"),
    "gatewayConnectorTutorial must query /internal/connectors/{id}/tutorial",
  );
});
