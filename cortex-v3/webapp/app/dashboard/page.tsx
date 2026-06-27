import Link from "next/link";

import { BUDGET_ESCROW_PROGRAM_ID, DEVNET_CLUSTER } from "@/lib/programs";
import { formatLamports } from "@/lib/session";

interface Memory {
  id: string;
  summary: string;
  source: "ChatGPT" | "Claude" | "Gemini" | "manual";
  updatedAt: string;
  shareable: boolean;
}

interface ConnectedModel {
  id: string;
  name: string;
  status: "connected" | "disconnected";
}

const SAMPLE_MEMORIES: Memory[] = [
  {
    id: "mem-1",
    summary: "Flying to Berlin on July 10 for a conference.",
    source: "ChatGPT",
    updatedAt: "2026-06-26",
    shareable: false,
  },
  {
    id: "mem-2",
    summary: "Prefers concise replies and bullet lists.",
    source: "Claude",
    updatedAt: "2026-06-25",
    shareable: true,
  },
  {
    id: "mem-3",
    summary: "Uses vegetarian recipes for weekly meal planning.",
    source: "Gemini",
    updatedAt: "2026-06-24",
    shareable: false,
  },
];

const CONNECTED_MODELS: ConnectedModel[] = [
  { id: "chatgpt", name: "ChatGPT", status: "connected" },
  { id: "claude", name: "Claude", status: "connected" },
  { id: "gemini", name: "Gemini", status: "disconnected" },
];

const BUDGET_BALANCE_LAMPORTS = 47_500_000;
const BUDGET_SPENT_TODAY_LAMPORTS = 2_500_000;

export default function DashboardPage() {
  return (
    <main className="p-6 max-w-3xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Memory dashboard</h1>
        <p className="text-gray-600">
          Overview of your memory vault, budget, and connected models.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Recent memories</h2>
          <Link
            href="/memories/"
            className="text-sm text-indigo-600 hover:underline"
          >
            View all
          </Link>
        </div>
        {SAMPLE_MEMORIES.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No memories yet. Start a chat with a connected model.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {SAMPLE_MEMORIES.map((memory) => (
              <li
                key={memory.id}
                className="py-4 flex items-start justify-between gap-4"
              >
                <div>
                  <p className="font-medium text-sm">{memory.summary}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {memory.source} · {memory.updatedAt}
                  </p>
                </div>
                {memory.shareable && (
                  <span className="shrink-0 rounded-full bg-green-50 text-green-700 px-2 py-1 text-xs font-medium">
                    Shared
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold mb-4">Budget</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Available
            </p>
            <p className="text-xl font-semibold mt-1">
              {formatLamports(BUDGET_BALANCE_LAMPORTS)}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Spent today
            </p>
            <p className="text-xl font-semibold mt-1">
              {formatLamports(BUDGET_SPENT_TODAY_LAMPORTS)}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Memory budget covers on-chain anchoring fees.
        </p>
        <p className="text-xs text-gray-500 mt-1 font-mono break-all">
          {BUDGET_ESCROW_PROGRAM_ID}
        </p>
        <p className="text-xs text-gray-500 mt-1">Cluster: {DEVNET_CLUSTER}</p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold mb-4">Connected models</h2>
        <ul className="space-y-3">
          {CONNECTED_MODELS.map((model) => (
            <li key={model.id} className="flex items-center justify-between">
              <span className="font-medium">{model.name}</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  model.status === "connected"
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {model.status === "connected" ? "Connected" : "Disconnected"}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/connect/"
          className="mt-4 inline-block text-sm text-indigo-600 hover:underline"
        >
          Manage connections
        </Link>
      </section>
    </main>
  );
}
