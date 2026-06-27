export const DEVNET_CLUSTER = "devnet" as const;

export const PROGRAM_IDS = {
  memoryRegistry: "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM",
  budgetEscrow: "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh",
  capabilityRegistry: "CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3",
  royaltyRouter: "GcdayuLaLyrdmUu324nahyv33G5poQdLUEZ1nEytDeP",
  cortexTreasury: "LX3EUdRUBUa3TbsYXLEUdj9J3prXkWXvLYSWyYyc2Jj",
} as const;

export const MEMORY_REGISTRY_PROGRAM_ID = PROGRAM_IDS.memoryRegistry;
export const BUDGET_ESCROW_PROGRAM_ID = PROGRAM_IDS.budgetEscrow;
export const CAPABILITY_REGISTRY_PROGRAM_ID = PROGRAM_IDS.capabilityRegistry;
export const ROYALTY_ROUTER_PROGRAM_ID = PROGRAM_IDS.royaltyRouter;
export const CORTEX_TREASURY_PROGRAM_ID = PROGRAM_IDS.cortexTreasury;

export type ProgramName = keyof typeof PROGRAM_IDS;

export const PROGRAM_NAMES: ProgramName[] = [
  "memoryRegistry",
  "budgetEscrow",
  "capabilityRegistry",
  "royaltyRouter",
  "cortexTreasury",
];
