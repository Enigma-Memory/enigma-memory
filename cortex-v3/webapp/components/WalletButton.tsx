"use client";

import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useState } from "react";

import { useEnigmaWallet } from "@/app/providers";

export function WalletButton() {
  const { wallets, connected, disconnect, connect, publicKey } =
    useEnigmaWallet();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = connected
    ? `${publicKey?.toBase58().slice(0, 4)}...${publicKey
        ?.toBase58()
        .slice(-4)}`
    : "Connect browser wallet";

  async function connectWallet(name: string) {
    setError(null);
    try {
      await connect(name);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function handlePrimaryAction() {
    if (connected) {
      await disconnect();
      setOpen(false);
      return;
    }
    setOpen((value) => !value);
  }

  return (
    <div className="relative flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handlePrimaryAction}
        className="rounded-full bg-slate-900 px-6 py-3 text-white font-medium hover:bg-slate-800 transition"
      >
        {label}
      </button>
      {open && !connected && (
        <div className="absolute top-full z-10 mt-2 min-w-64 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-lg">
          {wallets.map((adapter) => {
            const available =
              adapter.readyState === WalletReadyState.Installed ||
              adapter.readyState === WalletReadyState.Loadable;
            return (
              <button
                key={adapter.name}
                type="button"
                disabled={!available}
                onClick={() => void connectWallet(adapter.name)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <img
                  src={adapter.icon}
                  alt=""
                  width={24}
                  height={24}
                  referrerPolicy="no-referrer"
                />
                <span>{adapter.name}</span>
                {!available && (
                  <span className="ml-auto text-xs text-slate-500">
                    Not installed
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="max-w-64 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
