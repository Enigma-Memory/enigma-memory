"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const { connected, disconnect, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const label = connected
    ? `${publicKey?.toBase58().slice(0, 4)}...${publicKey
        ?.toBase58()
        .slice(-4)}`
    : "Connect browser wallet";

  return (
    <button
      onClick={connected ? disconnect : () => setVisible(true)}
      className="rounded-full bg-slate-900 px-6 py-3 text-white font-medium hover:bg-slate-800 transition"
    >
      {label}
    </button>
  );
}
