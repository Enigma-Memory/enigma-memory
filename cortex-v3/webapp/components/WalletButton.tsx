'use client'

import { useState } from 'react'

export function WalletButton() {
  const [connected, setConnected] = useState(false)

  return (
    <button
      onClick={() => setConnected(!connected)}
      className="rounded-full bg-slate-900 px-6 py-3 text-white font-medium hover:bg-slate-800 transition"
    >
      {connected ? 'Wallet connected' : 'Connect wallet'}
    </button>
  )
}
