"use client";

import { useMemo } from "react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Commitment,
} from "@solana/web3.js";

import { DEVNET_CLUSTER, PROGRAM_IDS, ProgramName } from "./programs";

import memoryRegistryIdl from "../../target/idl/memory_registry.json";
import budgetEscrowIdl from "../../target/idl/budget_escrow.json";
import capabilityRegistryIdl from "../../target/idl/capability_registry.json";
import royaltyRouterIdl from "../../target/idl/royalty_router.json";
import cortexTreasuryIdl from "../../target/idl/cortex_treasury.json";

export type SolanaWallet = {
  publicKey: PublicKey;
  signTransaction: (
    tx: Parameters<AnchorProvider["wallet"]["signTransaction"]>[0]
  ) => Promise<Parameters<AnchorProvider["wallet"]["signTransaction"]>[0]>;
  signAllTransactions: (
    txs: Parameters<AnchorProvider["wallet"]["signAllTransactions"]>[0]
  ) => Promise<Parameters<AnchorProvider["wallet"]["signAllTransactions"]>[0]>;
};

const IDLS: Record<ProgramName, Idl> = {
  memoryRegistry: memoryRegistryIdl as Idl,
  budgetEscrow: budgetEscrowIdl as Idl,
  capabilityRegistry: capabilityRegistryIdl as Idl,
  royaltyRouter: royaltyRouterIdl as Idl,
  cortexTreasury: cortexTreasuryIdl as Idl,
};

const DEFAULT_COMMITMENT: Commitment = "confirmed";

export function getConnection(cluster: string = DEVNET_CLUSTER): Connection {
  return new Connection(
    clusterApiUrl(cluster as "devnet" | "testnet" | "mainnet-beta"),
    DEFAULT_COMMITMENT
  );
}

export function getProgramId(programName: ProgramName): PublicKey {
  return new PublicKey(PROGRAM_IDS[programName]);
}

export function getProvider(
  connection: Connection,
  wallet: SolanaWallet
): AnchorProvider {
  return new AnchorProvider(connection, wallet as AnchorProvider["wallet"], {
    commitment: DEFAULT_COMMITMENT,
  });
}

export function getProgram<T extends Idl = Idl>(
  programName: ProgramName,
  provider: AnchorProvider
): Program<T> {
  const idl = IDLS[programName] as T;
  return new Program<T>(idl, provider);
}

export function useAnchorProgram(
  programName: ProgramName,
  wallet?: SolanaWallet,
  cluster?: string
) {
  return useMemo(() => {
    const connection = getConnection(cluster);
    if (!wallet) {
      return { connection, program: null };
    }
    const provider = getProvider(connection, wallet);
    const program = getProgram(programName, provider);
    return { connection, provider, program };
  }, [programName, wallet, cluster]);
}

export type { ProgramName };
export { DEVNET_CLUSTER, PROGRAM_IDS };
