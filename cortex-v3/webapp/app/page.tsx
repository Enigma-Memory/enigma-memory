import { WalletButton } from '@/components/WalletButton'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight mb-4">Your Memory Wallet for AI</h1>
      <p className="text-lg text-gray-600 max-w-xl mb-8">
        Own, carry, and monetize the memories AI forms about you across ChatGPT, Claude, and Gemini.
      </p>
      <WalletButton />
      <section className="mt-16 grid gap-6 sm:grid-cols-3 text-left max-w-4xl w-full">
        <Feature title="Own your memory" body="Your AI memory is tied to your wallet, not a model provider." />
        <Feature title="Take it anywhere" body="One vault that works with any MCP-compatible AI." />
        <Feature title="Earn from it" body="Opt in and get paid when your memories help other agents." />
      </section>
    </main>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  )
}
