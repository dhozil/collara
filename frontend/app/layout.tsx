import "./globals.css"
import "./error-suppress"
import dynamic from "next/dynamic"
const Providers = dynamic(()=> import("../components/EvmProviders").then(m=> m.Providers), { ssr: false })
export const metadata = { title: "Covenant — Reputation Lending", description: "Under-collateralized lending via on-chain reputation. GenLayer Intelligent Contracts. EVM Compatible." }
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body className="font-sans"><Providers>{children}</Providers></body></html>
}
