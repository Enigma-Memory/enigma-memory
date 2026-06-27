"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

import {
  DEFAULT_AUTO_SAVE_SCOPE,
  DEFAULT_MAX_OPS_PER_DAY,
  DEFAULT_MAX_SPEND_PER_DAY,
  DEFAULT_MAX_SPEND_PER_TX,
  DEFAULT_SESSION_DAYS,
  MS_PER_DAY,
  SessionProposal,
  formatLamports,
  formatScope,
} from "@/lib/session";

export default function SessionPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [proposal, setProposal] = useState<SessionProposal | null>(null);
  const [status, setStatus] = useState<
    "idle" | "proposing" | "signing" | "sent" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const owner = wallet.publicKey?.toBase58() ?? null;
  const isReady = wallet.connected && wallet.signTransaction && owner;

  async function authorize() {
    if (!isReady || !wallet.publicKey || !wallet.signTransaction) return;

    setStatus("proposing");
    setError(null);
    setSignature(null);

    try {
      const response = await fetch("/api/session/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          scope: DEFAULT_AUTO_SAVE_SCOPE,
          maxSpendPerTx: DEFAULT_MAX_SPEND_PER_TX,
          maxSpendPerDay: DEFAULT_MAX_SPEND_PER_DAY,
          maxOpsPerDay: DEFAULT_MAX_OPS_PER_DAY,
        }),
      });

      const result = (await response.json()) as
        | { ok: true; proposal: SessionProposal; serializedTransaction: string }
        | { ok: false; error: string };

      if (!result.ok) {
        setStatus("error");
        setError(result.error);
        return;
      }

      setProposal(result.proposal);

      setStatus("signing");
      const tx = Transaction.from(
        Buffer.from(result.serializedTransaction, "base64")
      );
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      setSignature(sig);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const expiresAt = proposal
    ? new Date(proposal.expiresAt * 1000).toLocaleDateString()
    : new Date(
        Date.now() + DEFAULT_SESSION_DAYS * MS_PER_DAY
      ).toLocaleDateString();

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Auto-Save Session</h1>
      <p className="text-gray-600 mb-6">
        Authorize Enigma to anchor memories and spend a capped memory budget
        without asking every time.
      </p>

      {!wallet.connected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm mb-6">
          Connect your wallet above to authorize a session.
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
        <h2 className="font-semibold mb-4">Current session terms</h2>
        <dl className="grid gap-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Owner</dt>
            <dd className="font-mono truncate max-w-[16rem]">{owner ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Session PDA</dt>
            <dd className="font-mono truncate max-w-[16rem]">
              {proposal?.sessionPda ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Expires</dt>
            <dd>{expiresAt}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Max spend / tx</dt>
            <dd>
              {formatLamports(
                proposal?.maxSpendPerTx ?? DEFAULT_MAX_SPEND_PER_TX
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Max spend / day</dt>
            <dd>
              {formatLamports(
                proposal?.maxSpendPerDay ?? DEFAULT_MAX_SPEND_PER_DAY
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Max ops / day</dt>
            <dd>{proposal?.maxOpsPerDay ?? DEFAULT_MAX_OPS_PER_DAY}</dd>
          </div>
        </dl>

        <h3 className="font-medium mt-6 mb-2 text-sm">Allowed actions</h3>
        <ul className="flex flex-wrap gap-2">
          {formatScope(proposal?.scope ?? DEFAULT_AUTO_SAVE_SCOPE).map(
            (label) => (
              <li
                key={label}
                className="rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-medium"
              >
                {label}
              </li>
            )
          )}
        </ul>
      </section>

      <button
        onClick={authorize}
        disabled={!isReady || status === "proposing" || status === "signing"}
        className="w-full rounded-xl bg-indigo-600 px-6 py-4 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {status === "idle" && "Authorize Auto-Save"}
        {status === "proposing" && "Preparing session…"}
        {status === "signing" && "Waiting for signature…"}
        {status === "sent" && "Auto-Save enabled"}
        {status === "error" && "Try again"}
      </button>

      {status === "sent" && signature && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900 text-sm">
          <p className="font-medium">Session created</p>
          <p className="font-mono break-all mt-1">{signature}</p>
        </div>
      )}

      {status === "error" && error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 text-sm">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1">{error}</p>
        </div>
      )}
    </main>
  );
}
