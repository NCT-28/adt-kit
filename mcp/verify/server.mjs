import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { runCheck } from "./check.mjs";

const server = new Server(
  { name: "verify", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "verify",
      description:
        "Run the project's check (.verify.json) and return a boolean verdict. " +
        "PASS → true (no log). FAIL → false + minimal failing evidence. " +
        "mode: 'full' forces the full suite regardless of defaultMode (use before merging).",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["affected", "full"],
            description: "Override defaultMode. 'full' runs the complete suite; 'affected' runs only tests touching changed code.",
          },
        },
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "verify") {
    return { isError: true, content: [{ type: "text", text: `unknown tool: ${req.params.name}` }] };
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const mode = req.params.arguments?.mode;
  const v = await runCheck(projectDir, mode);
  let text;
  if (v.error) text = `verify: ${v.error}`;
  else if (v.pass) text = v.cached ? "true (cached — no change since last PASS)" : "true";
  else text = `false\n\n${v.evidence ?? "(no evidence captured)"}`;
  return { content: [{ type: "text", text }] };
});

await server.connect(new StdioServerTransport());
