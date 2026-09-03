if (typeof window !== "undefined") {
  const shouldSuppress = (msg: string) =>
    msg.includes("not been authorized") ||
    msg.includes("onhogfjeacnfoofkfgppdlbmlmnplgbn") ||
    msg.includes("Failed to send message to service worker") ||
    msg.includes("disconnected port") ||
    msg.includes("PHANTOM") ||
    msg.includes("evmMetamask") ||
    msg.includes("contentScript") ||
    msg.includes("evmMetamask.js") ||
    msg.includes("contentScript.js") ||
    msg.includes("429") ||
    msg.includes("Too Many Requests") ||
    msg.includes("Rate limit exceeded") ||
    msg.includes("Rate limit") ||
    (msg.includes("Failed to fetch") && msg.includes("studio.genlayer.com")) ||
    msg.includes("__nextjs_original-stack-frame") ||
    (msg.includes("400 (Bad Request)") && msg.includes("__nextjs_original-stack-frame")) ||
    (msg.includes("GenLayer RPC error") && msg.includes("execution failed")) ||
    msg.includes("execution failed") ||
    msg.includes("page.tsx:141") ||
    msg.includes("fetchMyLiq") ||
    msg.includes("get_liquidity") ||
    msg.includes("get_identity") ||
    msg.includes("get_reputation") ||
    msg.includes("rehydrate") ||
    msg.includes("Cannot read properties of undefined") ||
    msg.includes("Content Security Policy") ||
    msg.includes("testnet-*.genlayer.com") ||
    msg.includes("Disconnected from polkadot")

  const origError = console.error
  console.error = (...args: any[]) => {
    const m = String(args[0] || "")
    if (shouldSuppress(m) || args.some((a: any) => typeof a === "string" && shouldSuppress(a))) return
    origError(...args)
  }

  window.addEventListener("unhandledrejection", (e: any) => {
    const m = String(e.reason?.message || e.reason || e.message || "")
    if (shouldSuppress(m)) {
      e.preventDefault()
      console.warn("[Collara] Suppressed wallet extension noise (Phantom/MetaMask):", m.slice(0,120))
    }
  })
  window.addEventListener("error", (e: any) => {
    const m = String(e.message || e.error?.message || "")
    if (shouldSuppress(m)) {
      e.preventDefault()
    }
  })
}
export {}
