import { ModelConnector } from "@/components/ModelConnector";

export const metadata = {
  title: "Connect AI Models — Enigma Cortex",
  description:
    "Link ChatGPT, Claude, and Gemini to your Enigma Cortex Memory Wallet.",
};

export default function ConnectPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          Connect your AI models
        </h1>
        <p className="text-gray-600 mb-8 max-w-2xl">
          Link ChatGPT, Claude, and Gemini to your Enigma Cortex Memory Wallet
          so every assistant can read from and write to the same memory vault.
        </p>
        <ModelConnector />
      </div>
    </main>
  );
}
