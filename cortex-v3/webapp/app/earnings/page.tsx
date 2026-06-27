import { ROYALTY_ROUTER_PROGRAM_ID, DEVNET_CLUSTER } from "@/lib/programs";

export default function EarningsPage() {
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Earnings</h1>
      <p className="text-gray-600">
        Track royalties from shared memories and agent usage.
      </p>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-700">
        <p>
          <strong>Program:</strong> royalty_router
        </p>
        <p className="font-mono break-all">{ROYALTY_ROUTER_PROGRAM_ID}</p>
        <p>
          <strong>Cluster:</strong> {DEVNET_CLUSTER}
        </p>
      </div>
    </main>
  );
}
