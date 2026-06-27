"use client";

import { useState } from "react";

type ModelId = "chatgpt" | "claude" | "gemini";

const OAUTH_ORIGIN =
  process.env.NEXT_PUBLIC_OAUTH_ORIGIN ?? "http://localhost:3001";

function buildOAuthAuthorizeUrl(model: ModelId): string {
  if (typeof window === "undefined") {
    return `${OAUTH_ORIGIN}/oauth/authorize`;
  }
  const origin = window.location.origin;
  const redirectUri = encodeURIComponent(`${origin}/oauth/callback/`);
  const scope = encodeURIComponent("memory:read memory:write");
  const state = encodeURIComponent(model);
  return `${OAUTH_ORIGIN}/oauth/authorize?response_type=code&client_id=cortex-webapp&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
}

const CONFIG_SNIPPETS: Record<
  "chatgpt" | "claude",
  { label: string; filename: string; body: string }
> = {
  chatgpt: {
    label: "ChatGPT GPTs / custom actions",
    filename: "cortex-chatgpt.json",
    body: JSON.stringify(
      {
        schema_version: "v1",
        name: "Enigma Cortex Memory Wallet",
        description: "Read and write durable memories via Enigma Cortex.",
        url: "https://api.enigma.memory/v1/memory",
        authentication: {
          type: "oauth",
          client_url: "https://app.enigma.memory/connect",
          scope: "memory:read memory:write",
          authorization_content_type: "application/x-www-form-urlencoded",
        },
      },
      null,
      2
    ),
  },
  claude: {
    label: "Claude Desktop MCP config",
    filename: "cortex-claude.json",
    body: JSON.stringify(
      {
        mcpServers: {
          cortex: {
            command: "npx",
            args: ["-y", "@enigma/cortex-mcp"],
            env: {
              CORTEX_MODEL: "claude",
              CORTEX_SCOPE: "memory:read memory:write",
            },
          },
        },
      },
      null,
      2
    ),
  },
};

function ModelCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ModelConnector() {
  const [copied, setCopied] = useState<ModelId | null>(null);

  const copyConfig = async (model: "chatgpt" | "claude") => {
    const snippet = CONFIG_SNIPPETS[model];
    try {
      await navigator.clipboard.writeText(snippet.body);
      setCopied(model);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback for browsers that block clipboard writes.
      const textarea = document.createElement("textarea");
      textarea.value = snippet.body;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(model);
      window.setTimeout(() => setCopied(null), 2000);
    }
  };

  const startOAuth = (model: ModelId) => {
    window.location.href = buildOAuthAuthorizeUrl(model);
  };

  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <ModelCard
        title="ChatGPT"
        description="Copy a GPT action schema and paste it into the ChatGPT GPTs builder."
        action={
          <div className="flex flex-col gap-3">
            <button
              onClick={() => copyConfig("chatgpt")}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition"
            >
              {copied === "chatgpt" ? "Copied!" : "Copy ChatGPT config"}
            </button>
            <p className="text-xs text-gray-500">
              Open ChatGPT → Configure GPT → Add actions → paste the schema.
            </p>
          </div>
        }
      />
      <ModelCard
        title="Claude"
        description="Copy an MCP server config for Claude Desktop or Claude Code."
        action={
          <div className="flex flex-col gap-3">
            <button
              onClick={() => copyConfig("claude")}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition"
            >
              {copied === "claude" ? "Copied!" : "Copy Claude MCP config"}
            </button>
            <p className="text-xs text-gray-500">
              Open Claude Desktop → Settings → Developer → Edit Config → paste.
            </p>
          </div>
        }
      />
      <ModelCard
        title="Gemini / Google"
        description="Authorize Gemini to read and write memories via OAuth 2.1."
        action={
          <div className="flex flex-col gap-3">
            <button
              onClick={() => startOAuth("gemini")}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition"
            >
              Connect Gemini
            </button>
            <p className="text-xs text-gray-500">
              You will be redirected to Google to authorize Cortex access.
            </p>
          </div>
        }
      />
    </section>
  );
}
