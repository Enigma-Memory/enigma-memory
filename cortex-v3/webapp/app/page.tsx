import { LoginButton } from '@/components/LoginButton'
import { WalletButton } from '@/components/WalletButton'
import { DEVNET_CLUSTER, PROGRAM_IDS, ProgramName } from '@/lib/programs'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight mb-4">Your Memory Wallet for AI</h1>
      <p className="text-lg text-gray-600 max-w-xl mb-8">
        Own, carry, and monetize the memories AI forms about you across ChatGPT, Claude, and Gemini.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <LoginButton />
        <WalletButton />
      </div>
      <section className="mt-16 grid gap-6 sm:grid-cols-3 text-left max-w-4xl w-full">
        <Feature title="Own your memory" body="Your AI memory is tied to your wallet, not a model provider." />
        <Feature title="Take it anywhere" body="One vault that works with any MCP-compatible AI." />
        <Feature title="Earn from it" body="Opt in and get paid when your memories help other agents." />
      </section>
      <section className="mt-16 max-w-4xl w-full text-left">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Wired Programs ({DEVNET_CLUSTER})</h2>
        <ul className="space-y-2 text-sm">
          {(Object.keys(PROGRAM_IDS) as ProgramName[]).map((name) => (
            <li key={name} className="rounded-lg border border-gray-200 bg-white p-3">
              <span className="font-medium capitalize">{name.replace(/([A-Z])/g, ' $1')}</span>
              <code className="block mt-1 break-all text-gray-600">{PROGRAM_IDS[name]}</code>
            </li>
          ))}
        </ul>
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
