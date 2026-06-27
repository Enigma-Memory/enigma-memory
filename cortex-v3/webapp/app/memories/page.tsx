import { MEMORY_REGISTRY_PROGRAM_ID, DEVNET_CLUSTER } from '@/lib/programs'

export default function MemoriesPage() {
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Your memories</h1>
      <p className="text-gray-600">Memory vault UI coming soon. Your encrypted memories will appear here.</p>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-700">
        <p><strong>Program:</strong> memory_registry</p>
        <p className="font-mono break-all">{MEMORY_REGISTRY_PROGRAM_ID}</p>
        <p><strong>Cluster:</strong> {DEVNET_CLUSTER}</p>
      </div>
    </main>
  )
}
