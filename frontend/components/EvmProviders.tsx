"use client"
import { WagmiProvider, createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { studionet } from "genlayer-js/chains"

export const genlayerStudionet = studionet

export const genlayerLocalnet = {
  id: 42213,
  name: "GenLayer Localnet",
  network: "localnet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:4000/api"] } },
} as any

const config = createConfig({
  chains: [genlayerStudionet, genlayerLocalnet as any],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [genlayerStudionet.id]: http("/api/genlayer"),
    [genlayerLocalnet.id as number]: http("http://127.0.0.1:4000/api"),
  },
  ssr: true,
  storage: null as any,
})

const qc = new QueryClient()

export function Providers({children}:{children:React.ReactNode}){
  return <WagmiProvider config={config}><QueryClientProvider client={qc}>{children}</QueryClientProvider></WagmiProvider>
}
