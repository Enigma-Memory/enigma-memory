"use client";

import {
  type SignerWalletAdapter,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl, Connection, type PublicKey } from "@solana/web3.js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl("devnet");
const SELECTED_WALLET_KEY = "enigma.selectedWallet";

interface EnigmaWalletContextValue {
  connection: Connection;
  wallets: readonly SignerWalletAdapter[];
  wallet: SignerWalletAdapter | null;
  connected: boolean;
  publicKey: PublicKey | null;
  connect(name: string): Promise<void>;
  disconnect(): Promise<void>;
}

const EnigmaWalletContext = createContext<EnigmaWalletContextValue | null>(null);


export function Providers({ children }: { children: ReactNode }) {
  const connection = useMemo(
    () => new Connection(SOLANA_RPC, "confirmed"),
    []
  );
  const wallets = useMemo<SignerWalletAdapter[]>(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  const [wallet, setWallet] = useState<SignerWalletAdapter | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const handleError = () => refresh();
    for (const adapter of wallets) {
      adapter.on("connect", refresh);
      adapter.on("disconnect", refresh);
      adapter.on("readyStateChange", refresh);
      adapter.on("error", handleError);
    }
    return () => {
      for (const adapter of wallets) {
        adapter.off("connect", refresh);
        adapter.off("disconnect", refresh);
        adapter.off("readyStateChange", refresh);
        adapter.off("error", handleError);
      }
    };
  }, [refresh, wallets]);

  useEffect(() => {
    const selectedName = window.localStorage.getItem(SELECTED_WALLET_KEY);
    const selected = wallets.find((adapter) => adapter.name === selectedName);
    if (
      !selected ||
      (selected.readyState !== WalletReadyState.Installed &&
        selected.readyState !== WalletReadyState.Loadable)
    ) {
      return;
    }

    setWallet(selected);
    if (!selected.connected && !selected.connecting) {
      void selected.autoConnect().catch(() => {
        window.localStorage.removeItem(SELECTED_WALLET_KEY);
        setWallet(null);
      });
    }
  }, [wallets]);

  const connect = useCallback(
    async (name: string) => {
      const selected = wallets.find((adapter) => adapter.name === name);
      if (
        !selected ||
        (selected.readyState !== WalletReadyState.Installed &&
          selected.readyState !== WalletReadyState.Loadable)
      ) {
        throw new Error(`${name} is not installed or available`);
      }

      if (wallet && wallet !== selected && wallet.connected) {
        await wallet.disconnect();
      }

      setWallet(selected);
      try {
        await selected.connect();
        window.localStorage.setItem(SELECTED_WALLET_KEY, selected.name);
      } catch (error) {
        setWallet(null);
        window.localStorage.removeItem(SELECTED_WALLET_KEY);
        throw error;
      }
    },
    [wallet, wallets]
  );

  const disconnect = useCallback(async () => {
    if (wallet) await wallet.disconnect();
    window.localStorage.removeItem(SELECTED_WALLET_KEY);
    setWallet(null);
  }, [wallet]);

  const value = useMemo<EnigmaWalletContextValue>(
    () => ({
      connection,
      wallets,
      wallet,
      connected: wallet?.connected ?? false,
      publicKey: wallet?.publicKey ?? null,
      connect,
      disconnect,
    }),
    [connect, connection, disconnect, revision, wallet, wallets]
  );

  return (
    <EnigmaWalletContext.Provider value={value}>
      {children}
    </EnigmaWalletContext.Provider>
  );
}

export function useEnigmaWallet() {
  const value = useContext(EnigmaWalletContext);
  if (!value) {
    throw new Error("useEnigmaWallet must be used inside Providers");
  }
  return value;
}
