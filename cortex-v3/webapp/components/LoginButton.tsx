'use client'

import { usePrivy } from '@privy-io/react-auth'

const RAW_PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID
const PRIVY_APP_ID =
  RAW_PRIVY_APP_ID && /^cl[a-zA-Z0-9]{10,}$/.test(RAW_PRIVY_APP_ID)
    ? RAW_PRIVY_APP_ID
    : undefined

function LoginButtonInner() {
  const { ready, authenticated, login, logout } = usePrivy()

  return (
    <button
      onClick={authenticated ? logout : login}
      disabled={!ready}
      className="rounded-full bg-indigo-600 px-6 py-3 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
    >
      {authenticated ? 'Log out' : 'Log in / Sign up'}
    </button>
  )
}

export function LoginButton() {
  if (!PRIVY_APP_ID) {
    return (
      <button
        disabled
        title="Set NEXT_PUBLIC_PRIVY_APP_ID to enable embedded wallet login"
        className="rounded-full bg-indigo-600/50 px-6 py-3 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        Wallet login unavailable
      </button>
    )
  }

  return <LoginButtonInner />
}
