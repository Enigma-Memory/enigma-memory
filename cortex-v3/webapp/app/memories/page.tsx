"use client";

import { useMemo, useState } from "react";

import { MEMORY_REGISTRY_PROGRAM_ID, DEVNET_CLUSTER } from "@/lib/programs";

interface Memory {
  id: string;
  summary: string;
  source: "ChatGPT" | "Claude" | "Gemini" | "manual";
  updatedAt: string;
  shareable: boolean;
  category: string;
}

const ALL_MEMORIES: Memory[] = [
  {
    id: "mem-1",
    summary: "Flying to Berlin on July 10 for a conference.",
    source: "ChatGPT",
    updatedAt: "2026-06-26",
    shareable: false,
    category: "travel",
  },
  {
    id: "mem-2",
    summary: "Prefers concise replies and bullet lists.",
    source: "Claude",
    updatedAt: "2026-06-25",
    shareable: true,
    category: "preference",
  },
  {
    id: "mem-3",
    summary: "Uses vegetarian recipes for weekly meal planning.",
    source: "Gemini",
    updatedAt: "2026-06-24",
    shareable: false,
    category: "lifestyle",
  },
  {
    id: "mem-4",
    summary: "Deadline for quarterly review is July 15.",
    source: "manual",
    updatedAt: "2026-06-23",
    shareable: false,
    category: "work",
  },
];

export default function MemoriesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | Memory["category"]>("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ALL_MEMORIES.filter((memory) => {
      const matchesQuery =
        normalized.length === 0 ||
        memory.summary.toLowerCase().includes(normalized);
      const matchesCategory =
        category === "all" || memory.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [query, category]);

  const categories = Array.from(new Set(ALL_MEMORIES.map((m) => m.category)));

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Your memories</h1>
      <p className="text-gray-600 mb-6">
        Search and browse everything Enigma has saved for you.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memories…"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={category}
          onChange={(e) =>
            setCategory(e.target.value as "all" | Memory["category"])
          }
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">
            No memories match your search.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((memory) => (
              <li
                key={memory.id}
                className="p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm">{memory.summary}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {memory.source} · {memory.updatedAt} ·{" "}
                    <span className="capitalize">{memory.category}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {memory.shareable && (
                    <span className="rounded-full bg-green-50 text-green-700 px-2 py-1 text-xs font-medium">
                      Shared
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-700">
        <p>
          <strong>Program:</strong> memory_registry
        </p>
        <p className="font-mono break-all">{MEMORY_REGISTRY_PROGRAM_ID}</p>
        <p>
          <strong>Cluster:</strong> {DEVNET_CLUSTER}
        </p>
      </div>
    </main>
  );
}
