/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  outputFileTracingRoot: __dirname,
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID:
      process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'clabcdef123456789012345',
    NEXT_PUBLIC_SOLANA_RPC:
      process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com',
  },
};

module.exports = nextConfig;
