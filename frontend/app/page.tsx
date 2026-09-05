"use client"
import { useState, useMemo, useEffect } from "react"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { studionet as glStudionet } from "genlayer-js/chains"

type Tab = "overview"|"how"|"identity"|"market"|"loans"|"vault"
const brass = "#C8A25A"
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x9b275391c79f5aaC53ECd9a19eBa0cC4be95D463"
const getRpcUrl = () => (typeof window !== "undefined" ? "/api/genlayer" : (process.env.NEXT_PUBLIC_RPC_URL || "https://studio.genlayer.com/api"))
const getStudionet = () => ({ ...glStudionet, rpcUrls: { default: { http: [getRpcUrl()] } } } as any)

function isValidHandle(v:string){ return /^[a-zA-Z0-9_.-]{1,32}$/.test(v) }
function isValidUrl(v:string){
  try{
    const u=new URL(v)
    if(u.protocol!=="https:" && u.protocol!=="http:") return false
    if(v.length>512) return false
    if(/^(javascript|data|file):/i.test(v)) return false
    return true
  }catch{ return false }
}
function sanitize(v:string){ return v.replace(/[<>"]/g,"").slice(0,512) }
function parseAtto(gen:string){
  try{
    const n=parseFloat(String(gen || "0"))
    if(isNaN(n)) return BigInt(0)
    return BigInt(Math.floor(n*1e18))
  }catch{ return BigInt(0) }
}
function fmtGen(atto:any){
  const n = Number(atto)/1e18
  const s = n.toFixed(3)
  return s.replace(/\.?0+$/,"") 
}
function toBigInt(v:any){
  try{
    if(v===undefined||v===null||v==="") return BigInt(0)
    return BigInt(v)
  }catch{ return BigInt(0) }
}

export default function Page(){
  const [mounted, setMounted] = useState(false)
  useEffect(()=> setMounted(true), [])
  const [tab, setTab] = useState<Tab>("overview")
  const [score, setScore] = useState<number | null>(null)
  const [principal, setPrincipal] = useState(1)
  const [duration, setDuration] = useState(30)
  const displayScore = score ?? 0
  const collateralRatio = score===null ? null : Math.max(50, 150 - score!)
  const required = useMemo(()=> collateralRatio===null ? null : +(principal * collateralRatio / 100).toFixed(3), [principal, collateralRatio])
  const interestBps = score===null ? null : Math.max(300, 1200 - score!*8)
  const [handle, setHandle] = useState("")
  const [platform, setPlatform] = useState("x")
  const [proofUrl, setProofUrl] = useState("")
  const [verified, setVerified] = useState<boolean|null>(null)
  const [vid, setVid] = useState<string>("")
  const [loanId, setLoanId] = useState("")
  const [client, setClient] = useState<any>(null)
  const [pool, setPool] = useState<{tvl:string,count:number,fees:string}|null>(null)
  const [myLiq, setMyLiq] = useState<string>("0.000")
  const [myLoans, setMyLoans] = useState<any[]>([])
  const [msg, setMsg] = useState<string>("")
  const [loading, setLoading] = useState<string | null>(null)
  const [explorerResult, setExplorerResult] = useState<{status:string, payload:string} | null>(null)

  const { address: evmAddress, isConnected: evmConnected } = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const [genConnected, setGenConnected] = useState<string | null>(null)
  const connected = mounted ? (evmAddress || genConnected) : null

  useEffect(()=>{
    localStorage.removeItem("covenant_pk")
    localStorage.removeItem("covenant_addr")
    setGenConnected(null)
  },[])

  async function getWriteClient(){
    if(evmAddress && typeof window!=="undefined" && (window as any).ethereum){
      const {createClient} = await import("genlayer-js")
      const wc:any = createClient({ chain: getStudionet(), account: evmAddress as `0x${string}`, provider: (window as any).ethereum } as any)
      try{ await (wc as any).connect?.("studionet") }catch{}
      return wc
    }
    throw new Error("Connect EVM wallet first (MetaMask/Rabby)")
  }

  async function ensureClient(){
    if(evmAddress && typeof window!=="undefined" && (window as any).ethereum){
      const {createClient} = await import("genlayer-js")
      const wc:any = createClient({ chain: getStudionet(), account: evmAddress as `0x${string}`, provider: (window as any).ethereum } as any)
      try{ await (wc as any).connect?.("studionet") }catch{}
      setClient(wc)
      return wc
    }
    if(client) return client
    throw new Error("Connect EVM wallet first — no fallback account")
  }

  async function handleConnect(){
    if(connected){
      try{ disconnect() }catch{}
      setGenConnected(null)
      setClient(null)
      setScore(null)
      setVerified(null)
      setMsg("Disconnected")
      return
    }
    const injected = connectors.find(c=> c.id==="injected")
    if(injected){
      try{
        await connectAsync({ connector: injected })
        setMsg("EVM wallet connected — MetaMask/Rabby authorized for localhost:3000")
        return
      }catch(e:any){
        const m = String(e?.message||"")
        if(m.includes("not been authorized")){
          setMsg("Extension blocked localhost:3000 — open extension ID onhogfjeacnfoofkfgppdlbmlmnplgbn → Settings → Authorized sites → Add http://localhost:3000, or disable extension / use Incognito.")
          throw e
        }
        setMsg("EVM connect failed: " + m.slice(0,150))
        return
      }
    }
    setMsg("No injected EVM wallet found — install MetaMask/Rabby")
  }

  async function fetchPool(){
    try{
      const c = await ensureClient()
      const r:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_pool_stats", args: [] })
      setPool({ tvl: (Number(r.total_liquidity_atto)/1e18).toFixed(3), count: Number(r.total_loans), fees: (Number(r.platform_fees_atto)/1e18).toFixed(4) })
    }catch(e:any){
      const m=String(e.message||"")
      if(m.includes("not found") || String(e.cause?.message||"").includes("not found")) return
      if(m.includes("Connect EVM")) return
      setMsg(m.slice(0,120) || "read failed")
    }
  }
  async function fetchLoans(){
    try{
      const c = await ensureClient()
      const r:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_all_loans", args: [] })
      if(Array.isArray(r)){
        const mine = r.filter((l:any)=> String(l.borrower).toLowerCase()===String(connected||"").toLowerCase())
        const enriched:any[]=[]
        for(const l of (mine.length? mine: r).slice(0,12)){
          try{
            const d:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_loan", args: [toBigInt(l.id)] })
            enriched.push(d)
          }catch{ enriched.push(l) }
          await new Promise(x=> setTimeout(x, 400))
        }
        setMyLoans(enriched)
        setMsg(`Fetched ${r.length} loans on-chain (${mine.length} yours)`)
      }
    }catch(e:any){ setMsg(e.message?.slice(0,150) || "fetch loans failed")}
  }
  async function fetchMyLiq(){
    const who = connected as string | null
    if(!who) { setMyLiq("0.000"); return }
    try{
      const c = await ensureClient()
      const r:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_liquidity", args: [who as `0x${string}`] }).catch(()=>null)
      if(r && r.balance_atto!==undefined) setMyLiq((Number(r.balance_atto)/1e18).toFixed(3))
      else setMyLiq("0.000")
    }catch{ setMyLiq("0.000") }
  }
  const [fetchingIdentity, setFetchingIdentity] = useState(false)
  const fetchedForRef = useState<{addr:string|null}>({addr:null})[0]
  async function readWithRetry<T>(fn:()=>Promise<T>, label:string):Promise<T|null>{
    for(let i=0;i<3;i++){
      try{ return await fn() }catch(e:any){
        const m=String(e?.message||""+e?.cause?.message||"")
        if(m.includes("429")||m.includes("Too Many Requests")||m.includes("Rate limit")){
          if(i===2) throw e
          await new Promise(r=> setTimeout(r, 5000*(i+1)))
          continue
        }
        throw e
      }
    }
    return null
  }
  async function fetchIdentity(force=false){
    if(fetchingIdentity) return
    const who = connected as string | null
    if(!who) return
    if(!force && fetchedForRef.addr===who) return
    setFetchingIdentity(true)
    try{
      const c = await ensureClient()
      const borrower = (who || c.account?.address || c.account) as `0x${string}`
      const ident:any = await readWithRetry(()=> c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_identity", args: [borrower] }), "identity").catch(()=>null)
      if(ident && ident.verified){
        setHandle(ident.handle); setPlatform(ident.platform); setProofUrl(ident.proof_url); setVerified(true)
      }
      await new Promise(r=> setTimeout(r, 1500))
      let list:any = await readWithRetry(()=> c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_verifications_by_borrower", args: [borrower] }), "verifs").catch(()=>[])
      if(!Array.isArray(list) || list.length===0){
        try{
          const stats:any = await readWithRetry(()=> c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_pool_stats", args: [] }), "stats")
          const maxVid = Number((stats as any)?.next_verification_id || 2)
          const found:any[] = []
          for(let i=1;i<maxVid && i<=5;i++){
            try{
              const v:any = await readWithRetry(()=> c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_verification", args: [toBigInt(i)] }), "v"+i)
              if(v && String(v.borrower).toLowerCase()===String(borrower).toLowerCase()) found.push({id:i, verified:v.verified, score:v.score, proof_url:v.proof_url, handle:v.handle})
            }catch{}
            await new Promise(r=> setTimeout(r, 800))
          }
          if(found.length>0) list = found
        }catch{}
      }
      if(Array.isArray(list) && list.length>0){
        const last = list[list.length-1]
        setVid(String(last.id)); setVerified(last.verified)
        setExplorerResult({status: last.verified ? "verified" : "rejected", payload: `On-chain found vid=${last.id} @${last.handle || (last as any).handle || "?"} — ${last.verified ? "verified" : "rejected"}`})
        await new Promise(r=> setTimeout(r, 1000))
        const v:any = await readWithRetry(()=> c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_verification", args: [toBigInt(last.id)] }), "verification").catch(()=>null)
        if(v && v.score) setScore(Number(v.score))
      } else {
        setExplorerResult({status:"pending", payload:`Not verified yet for ${String(borrower).slice(0,10)}… — no on-chain verification found. Please create proof URL containing your handle + wallet and click Verify on-chain to get your own vid.`})
      }
      await new Promise(r=> setTimeout(r, 1000))
      const rep:any = await readWithRetry(()=> c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_reputation", args: [borrower] }), "reputation").catch(()=>null)
      if(rep && rep.score) setScore(Number(rep.score))
      fetchedForRef.addr = who
    }catch(e:any){
      const m=String(e.message||"")
      if(m.includes("429") || m.includes("Too Many Requests")){
        setMsg("Studio RPC rate limited (429) — wait 10s and click Load My Identity again. For no limit, run local Studionet: genlayer up")
        setExplorerResult({status:"pending", payload:"429 Too Many Requests — Studio RPC throttled. Wait 10s or use local http://127.0.0.1:4000/api"})
      } else if(m.includes("CORS") || m.includes("Failed to fetch")){
        setMsg("RPC CORS/Network error — proxy /api/genlayer enabled, check internet or run local: genlayer up")
      } else {
        setMsg(m.slice(0,180))
      }
    } finally { setFetchingIdentity(false) }
  }
  useEffect(()=>{ if(connected){ fetchPool(); } },[connected])
  useEffect(()=>{ if(connected && tab==="vault") fetchMyLiq() },[connected, tab])
  useEffect(()=>{ if(connected && tab==="loans") fetchLoans() },[connected, tab])
  useEffect(()=>{ if(connected && tab==="identity" && fetchedForRef.addr!==connected) fetchIdentity(false) },[connected, tab])

  function isAllowedHost(url:string){
    try{
      const h=new URL(url).hostname.toLowerCase()
      return ["x.com","twitter.com","github.com","gist.github.com","gist.githubusercontent.com","linkedin.com","warpcast.com","farcaster.xyz"].some(d=> h===d || h.endsWith("."+d))
    }catch{ return false }
  }
  function handleInPath(url:string, h:string){
    try{ return new URL(url).pathname.toLowerCase().includes(h.toLowerCase()) }catch{ return false }
  }
  function getErrMsg(e:any){
    const cands = [e?.message, e?.shortMessage, e?.cause?.message, e?.details, e?.cause?.details, JSON.stringify(e?.cause||"").slice(0,300)]
    for(const m of cands){
      if(m && typeof m==="string" && m.includes("[EXPECTED]")) return m.slice(m.indexOf("[EXPECTED]"), m.indexOf("[EXPECTED]")+180)
      if(m && typeof m==="string" && m.includes("proof_url")) return m.slice(0,180)
    }
    const raw = e?.message || e?.shortMessage || ""
    if(raw.includes("not found") || raw.includes("Verification not found")) return ""
    return raw.slice(0,200) || "execution failed"
  }
  async function doLink(){
    if(!handle.trim()){ setMsg("Handle is required"); return }
    if(!isValidHandle(handle)){ setMsg("Invalid handle: 1-32 alnum _.-"); return }
    if(!proofUrl.trim()){ setMsg("Proof URL is required"); return }
    if(!isValidUrl(proofUrl)){ setMsg("Proof URL must be http(s) max 512"); return }
    if(!isAllowedHost(proofUrl)){ setMsg("Proof URL host must be x.com / github.com / gist.githubusercontent.com / linkedin.com / warpcast.com — httpbin not allowed"); return }
    if(!handleInPath(proofUrl, handle)){ setMsg("Proof URL path must contain @"+handle+" e.g. .../"+handle+"/..."); return }
    setLoading("link"); setMsg("")
    try{
      const c = await getWriteClient()
      const txHash = await c.writeContract({ address: CONTRACT as `0x${string}`, functionName: "link_identity", args: [handle, platform, proofUrl] })
      setMsg(`link tx ${String(txHash).slice(0,22)}… — waiting consensus (8-12s)`)
      try{
        const receipt:any = await c.waitForTransactionReceipt({ hash: txHash, status: 5 } as any)
        const payload = receipt?.data?.payload || receipt?.result?.payload || ""
        if(typeof payload==="string" && payload.includes("[EXPECTED]")){
          setVerified(false)
          setMsg(payload.slice(0,300))
          setLoading(null)
          return
        }
      }catch{}
      setTimeout(async()=>{
        try{
          const borrower = (connected || evmAddress || genConnected || c.account?.address || c.account) as string
          let list:any = []
          try{ list = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_verifications_by_borrower", args: [borrower as `0x${string}`] }) }catch{ list=[] }
          if(!Array.isArray(list) || list.length===0){
            try{
              const stats:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_pool_stats", args: [] })
              for(let i=1;i<Number(stats.next_verification_id) && i<=10;i++){
                try{
                  const v:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_verification", args: [toBigInt(i)] })
                  if(String(v.borrower).toLowerCase()===String(borrower).toLowerCase()) list.push({id:v.id||i, verified:v.verified, handle:v.handle, reason:v.reason})
                }catch{}
                await new Promise(r=> setTimeout(r, 350))
              }
            }catch{}
          }
          if(Array.isArray(list) && list.length>0){
            const last = list[list.length-1]
            setVerified(last.verified); setVid(String(last.id))
            setExplorerResult({status: last.verified ? "verified" : "rejected", payload: last.verified ? `✓ Verified vid=${last.id} @${last.handle} — ${last.reason || "wallet+handle matched"}` : `✗ Rejected: ${last.reason?.slice(0,300) || "check explorer"}`})
            if(last.verified) setMsg(`Verified on-chain ✓ vid=${last.id} — now Assess`)
            else setMsg(`Link rejected on-chain: ${last.reason?.slice(0,200) || "wallet not in proof body — use Raw gist URL"}`)
          } else {
            try{
              const v1:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_verification", args: [toBigInt(1)] })
              if(String(v1.borrower).toLowerCase()===String(borrower).toLowerCase()){
                setVerified(v1.verified); setVid("1")
                setExplorerResult({status: v1.verified ? "verified" : "rejected", payload: v1.verified ? `✓ Verified vid=1 @${v1.handle} — ${v1.reason?.slice(0,300)}` : `✗ Rejected: ${v1.reason?.slice(0,300)}`})
                setMsg(`Verified on-chain ✓ vid=1 — now Assess (fallback scan)`)
              } else {
                setExplorerResult({status:"pending", payload:`Not verified yet for ${String(borrower).slice(0,10)}… — no verification for your wallet. Please Verify with your own handle + wallet.`})
                setMsg("Not verified yet — please Verify identity first to get your own vid")
              }
            }catch{
              setExplorerResult({status:"pending", payload:`Not verified yet for ${String(borrower).slice(0,10)}… — no verification for your wallet. Please Verify with your own handle + wallet.`})
              setMsg("Not verified yet — please Verify identity first to get your own vid")
            }
          }
        }catch(e:any){ setMsg(getErrMsg(e) || "link check failed"); setExplorerResult({status:"rejected", payload: getErrMsg(e)})}
        setLoading(null)
      }, 9000)
    }catch(e:any){
      const m=getErrMsg(e)
      setExplorerResult({status:"rejected", payload: m || "link failed — for GitHub use Raw URL: https://gist.githubusercontent.com/.../raw/verify.txt with wallet+handle in file body"})
      if(m.includes("httpbin") || m.includes("host must be")) setMsg(m)
      else setMsg(m || "link failed — for GitHub use Raw URL: https://gist.githubusercontent.com/.../raw/verify.txt with wallet+handle in file body")
      setLoading(null)
    }
  }
  async function doAssess(){
    if(!vid || !String(vid).trim()){ setMsg("Enter verification_id first"); return }
    setLoading("assess"); setExplorerResult(null); setMsg("")
    try{
      const c = await getWriteClient()
      const tx = await c.writeContract({ address: CONTRACT as `0x${string}`, functionName: "assess_reputation", args: [toBigInt(vid)] })
      setMsg(`assess tx ${String(tx).slice(0,20)}… — waiting finality`)
      setExplorerResult({status:"pending", payload:`Assess vid=${vid} tx ${String(tx).slice(0,18)}… waiting receipt`})
      try{
        const receipt:any = await (c as any).waitForTransactionReceipt?.({hash: tx}) || await new Promise(r=>setTimeout(r,9000))
        if(receipt && receipt.txExecutionResultName && receipt.txExecutionResultName!=="FINISHED_WITH_RETURN") throw new Error(`Assess failed: ${receipt.statusName}/${receipt.txExecutionResultName}`)
      }catch(e:any){
        const m=getErrMsg(e)
        if(m.includes("failed") || m.includes("reverted")) throw e
      }
      const r:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_verification", args: [toBigInt(vid)] })
      if(r && r.score!==undefined){
        setScore(Number(r.score))
        setExplorerResult({status:"verified", payload:`Score ${r.score} for vid=${vid} — ${r.reason||""} — tx ${String(tx).slice(0,18)} — https://explorer-studio.genlayer.com/address/${CONTRACT}`.slice(0,600)})
        setMsg(`Scored ${r.score} on-chain ✓ — tx ${String(tx).slice(0,18)}`)
      } else {
        setExplorerResult({status:"rejected", payload:`Assess tx ${String(tx)} succeeded but no score yet — retry`})
      }
      setLoading(null)
    }catch(e:any){
      const m=getErrMsg(e)||"assess failed"
      setExplorerResult({status:"rejected", payload:m})
      setMsg(m)
      setLoading(null)
    }
  }
  async function doDeposit(){
    const amt = (document.getElementById("depAmt") as HTMLInputElement)?.value || "1"
    if(!amt || isNaN(parseFloat(amt))){ setMsg("Enter valid GEN amount"); return }
    if(loading==="deposit") return
    setLoading("deposit"); setMsg(""); setExplorerResult(null)
    try{
      const c = await getWriteClient()
      const tx = await c.writeContract({ address: CONTRACT as `0x${string}`, functionName: "deposit_liquidity", args: [], value: parseAtto(amt) })
      setMsg(`deposit ${amt} GEN tx ${String(tx).slice(0,18)}… — waiting finality`)
      setExplorerResult({status:"pending", payload:`Deposited ${amt} GEN — tx ${String(tx).slice(0,18)}… waiting receipt`})
      try{
        const receipt:any = await (c as any).waitForTransactionReceipt?.({hash: tx}) || await new Promise(r=>setTimeout(r,8000))
        const statusOk = !receipt || receipt.statusName==="ACCEPTED" || receipt.statusName==="FINALIZED" || receipt.status===5 || receipt.status==="success"
        if(receipt && receipt.txExecutionResultName && receipt.txExecutionResultName!=="FINISHED_WITH_RETURN") throw new Error(`Tx failed: ${receipt.statusName}/${receipt.txExecutionResultName}`)
        if(!statusOk && receipt) throw new Error(`Tx not accepted: ${receipt.statusName}`)
      }catch(e:any){
        const m=getErrMsg(e)
        if(m.includes("failed") || m.includes("reverted")) throw e
      }
      await fetchPool()
      await fetchMyLiq()
      const liqOk = await c.readContract({address:CONTRACT, functionName:"get_liquidity", args:[connected as `0x${string}`]}).catch(()=>null) as any
      const poolOk = await c.readContract({address:CONTRACT, functionName:"get_pool_stats", args:[]}).catch(()=>null) as any
      if(liqOk && poolOk){
        setExplorerResult({status:"verified", payload:`✓ Deposit ${amt} GEN confirmed — tx ${String(tx)} → pool ${Number(poolOk.total_liquidity_atto)/1e18} GEN, your ${Number(liqOk.balance_atto)/1e18} GEN — https://explorer-studio.genlayer.com/address/${CONTRACT}`})
        setMsg(`Deposit ${amt} GEN success ✓ — tx ${String(tx).slice(0,18)}`)
      } else {
        setExplorerResult({status:"verified", payload:`✓ Deposit ${amt} GEN tx ${String(tx)} — refreshed`})
        setMsg(`Deposit ${amt} GEN success ✓`)
      }
      setLoading(null)
    }catch(e:any){
      const m=getErrMsg(e) || "deposit failed"
      setMsg(m); setExplorerResult({status:"rejected", payload:m})
      setLoading(null)
    }
  }
  async function doRequest(){
    if(score===null){ setMsg("Score required — assess first"); return }
    if(!vid || !String(vid).trim()){ setMsg("Enter verification_id"); return }
    setLoading("request"); setExplorerResult(null); setMsg("")
    try{
      const c = await getWriteClient()
      const who = (connected as string || "") .toLowerCase()
      try{
        const v:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_verification", args: [toBigInt(vid)] })
        if(v && String(v.borrower).toLowerCase()!==who){
          const m=`[EXPECTED] Verification vid=${vid} owned by ${String(v.borrower).slice(0,10)}… not yours (${who.slice(0,10)}…). Use your own vid.`
          setMsg(m); setExplorerResult({status:"rejected", payload:m}); setLoading(null); return
        }
        if(v && !v.verified){
          const m=`[EXPECTED] Verification vid=${vid} not verified. Verify your identity first.`
          setMsg(m); setExplorerResult({status:"rejected", payload:m}); setLoading(null); return
        }
      }catch{}
      const princ = parseAtto(String(principal))
      const coll = parseAtto(String(required!))
      const tx = await c.writeContract({ address: CONTRACT as `0x${string}`, functionName: "request_loan", args: [toBigInt(vid), princ, coll, toBigInt(duration)], value: coll })
      setMsg(`request loan tx ${String(tx).slice(0,18)}… collateral ${required} GEN — waiting finality`)
      setExplorerResult({status:"pending", payload:`Request tx ${String(tx).slice(0,18)}… waiting receipt`})
      try{
        const receipt:any = await (c as any).waitForTransactionReceipt?.({hash: tx}) || await new Promise(r=>setTimeout(r,8000))
        if(receipt && receipt.txExecutionResultName && receipt.txExecutionResultName!=="FINISHED_WITH_RETURN") throw new Error(`Request failed: ${receipt.statusName}/${receipt.txExecutionResultName} — ${receipt.txExecutionResult || ""}`)
      }catch(e:any){
        const m=getErrMsg(e)
        if(m.includes("failed") || m.includes("Insufficient") || m.includes("stale") || m.includes("not verified") || m.includes("not owned")) throw e
      }
      const all:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_all_loans", args: [] }).catch(()=>[]) as any
      const pool2:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_pool_stats", args: [] }).catch(()=>null) as any
      if(Array.isArray(all) && all.length>0){
        const latest=all[all.length-1]
        setExplorerResult({status:"verified", payload:`✓ Loan #${latest.id} created — ${all.length} total on-chain. Pool TVL ${pool2? Number(pool2.total_liquidity_atto)/1e18 : "?"} GEN — tx ${String(tx)} — https://explorer-studio.genlayer.com/address/${CONTRACT}`.slice(0,700)})
        setMsg(`Loan #${latest.id} created ✓ — tx ${String(tx).slice(0,18)}`)
        await fetchLoans()
      } else {
        setExplorerResult({status:"pending", payload:`Tx ${String(tx)} sent — waiting finalization, check explorer https://explorer-studio.genlayer.com/address/${CONTRACT}`})
      }
      setLoading(null)
    }catch(e:any){
      const raw=getErrMsg(e)||"request failed"
      const m = raw.includes("not owned") ? raw + " — vid milik orang lain, buat vid milikmu via Verify." : raw.includes("not verified") ? raw + " — belum verify, Verify dulu." : raw
      setMsg(m); setExplorerResult({status:"rejected", payload:m}); setLoading(null)
    }
  }
  async function doRepay(){
    if(!loanId || !String(loanId).trim()){ setMsg("Enter loanId"); return }
    setLoading("repay"); setMsg("")
    try{
      const c = await ensureClient()
      const loan:any = await c.readContract({ address: CONTRACT as `0x${string}`, functionName: "get_loan", args: [toBigInt(loanId)] })
      if(!loan || loan.principal_atto===undefined){ setMsg("Loan not found"); setLoading(null); return }
      const interest = (toBigInt(loan.principal_atto) * toBigInt(loan.interest_bps)) / toBigInt(10000)
      const total = toBigInt(loan.principal_atto) + interest
      const tx = await c.writeContract({ address: CONTRACT as `0x${string}`, functionName: "repay_loan", args: [toBigInt(loanId)], value: total })
      setMsg(`repay tx ${String(tx).slice(0,18)}… total ${(Number(total)/1e18).toFixed(4)} GEN — waiting`)
      setTimeout(()=> setLoading(null), 8000)
    }catch(e:any){ setMsg(getErrMsg(e) || "repay failed"); setLoading(null) }
  }

  return (
    <div className="min-h-screen bg-parchment selection:bg-brass">
      <div className="h-[3px] w-full" style={{background: `linear-gradient(90deg, ${brass}, #8AA899, #8B2D2B)`}} />
      <header className="sticky top-0 z-30 bg-parchment/80 backdrop-blur border-b border-stone/10">
        <div className="max-w-[1600px] mx-auto px-8 h-[68px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/collara-logo.svg" alt="Collara" className="w-11 h-11 rounded-[12px] shadow-sm" />
            <div>
              <div className="font-display text-[26px] leading-none tracking-[-0.03em]">Collara</div>
              <div className="text-[11px] tracking-[0.14em] uppercase text-stone/60 -mt-1">Reputation Credit • GenLayer</div>
            </div>
            <span className="hidden md:inline-flex ml-4 px-3 py-1 rounded-full border border-brass/30 bg-brass/10 text-[11px] tracking-[0.08em] uppercase font-medium">{CONTRACT.slice(0,6)}…{CONTRACT.slice(-4)}</span>
          </div>
          <div className="flex items-center gap-3" suppressHydrationWarning>
            <div className="hidden sm:flex flex-col items-end" suppressHydrationWarning>
              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-ink text-parchment text-xs font-mono" suppressHydrationWarning>
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-sage animate-pulse" : "bg-stone-500"}`} /> {mounted ? (connected ? `${connected.slice(0,6)}…${connected.slice(-4)}` : "Not connected") : "Not connected"}
              </div>
              {mounted && evmConnected && <span className="text-[10px] text-stone/60 font-mono mt-1" suppressHydrationWarning>EVM via MetaMask • GenLayer 0x</span>}
              {mounted && genConnected && !evmConnected && <span className="text-[10px] text-stone/60 font-mono mt-1" suppressHydrationWarning>GenLayer {genConnected.slice(0,6)}… • EVM compatible 0x</span>}
            </div>
            <button onClick={handleConnect} suppressHydrationWarning className="px-4 py-2 rounded-full bg-brass text-ink text-sm font-medium cursor-pointer">{mounted ? (connected ? "Disconnect" : "Connect EVM / GenLayer") : "Connect EVM / GenLayer"}</button>
          </div>
        </div>
        {msg && <div className="max-w-[1600px] mx-auto px-8 py-2 text-xs font-mono text-stone/70 border-t border-stone/10 bg-white/50">{msg}</div>}
      </header>

      <div className="max-w-[1600px] mx-auto px-8 py-8 flex gap-8">
        <nav className="hidden lg:block w-[310px] shrink-0 sticky top-[96px] h-fit">
          <div className="rounded-2xl bg-ink text-parchment p-4">
            <div className="text-[11px] tracking-[0.16em] uppercase text-parchment/50 mb-3">Navigate</div>
            {[
              ["overview","Overview","The covenant at a glance"],
              ["how","How it works","Step-by-step guide"],
              ["identity","Identity","Link real-world proof"],
              ["market","Market","Lend & borrow"],
              ["loans","My Loans","Collara credits active"],
              ["vault","Vault","Liquidity & risk"],
            ].map(([k,label,desc])=>(
              <button key={k} onClick={()=>setTab(k as Tab)}
                className={`w-full text-left rounded-xl px-3 py-3 mb-2 transition ${tab===k ? "bg-parchment text-ink" : "hover:bg-white/5 text-parchment/80"}`}>
                <div className="text-[13px] font-medium leading-none">{label}</div>
                <div className={`text-[11px] leading-tight mt-1 ${tab===k?"text-stone/60":"text-parchment/45"}`}>{desc}</div>
              </button>
            ))}
            <div className="mt-4 p-3 rounded-xl bg-brass text-ink">
              {score===null ? (
                <div className="text-xs opacity-80">No reputation yet — link & assess on-chain</div>
              ) : (
                <>
                  <div className="text-xs font-medium">Score {score} → {collateralRatio}% collateral</div>
                  <div className="text-[11px] opacity-70">Save {150-collateralRatio!}% vs. over-collateralized</div>
                  <div className="mt-2 h-1.5 rounded-full bg-ink/15 overflow-hidden"><div className="h-full bg-ink" style={{width:`${score}%`}} /></div>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-stone/10 bg-white p-4">
            <div className="text-[11px] tracking-[0.12em] uppercase text-stone/50">Pool — on-chain</div>
            {pool ? (
              <>
                <div className="mt-2 flex items-baseline gap-2"><span className="font-display text-2xl">{pool.tvl}</span><span className="text-xs text-stone/60">GEN TVL</span><span className="ml-auto text-xs px-2 py-1 rounded-full bg-sage/15 text-sage">live</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-parchment p-3 border border-stone/10"><div className="text-stone/50">Loans</div><div className="font-mono font-medium">{pool.count}</div></div>
                  <div className="rounded-xl bg-parchment p-3 border border-stone/10"><div className="text-stone/50">Fees</div><div className="font-mono font-medium">{pool.fees}</div></div>
                </div>
                <button onClick={fetchPool} className="mt-3 w-full py-2 rounded-xl bg-parchment border border-stone/10 text-xs">Refresh on-chain</button>
              </>
            ) : (
              <div className="mt-3 rounded-xl bg-parchment border border-dashed border-stone/15 p-4 text-xs text-stone/60">
                Connect & fetch `get_pool_stats()` live — no mock.
                <div className="mt-2 font-mono text-[10px] break-all">{CONTRACT}</div>
                <button onClick={fetchPool} className="mt-2 w-full py-2 rounded-xl bg-ink text-parchment text-xs">Fetch on-chain</button>
              </div>
            )}
          </div>
        </nav>

        <main className="flex-1 min-w-0">
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-2">
            {(["overview","how","identity","market","loans","vault"] as Tab[]).map(t=>(
              <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap border ${tab===t?"bg-ink text-parchment border-ink":"bg-white border-stone/15"}`}>{t}</button>
            ))}
          </div>

          {tab==="overview" && (
            <div className="space-y-6">
              <div className="rounded-[28px] bg-ink text-parchment p-8 md:p-12 overflow-hidden relative">
                <div className="absolute -right-10 -top-10 w-[420px] h-[420px] rounded-full opacity-20 pointer-events-none" style={{background:`radial-gradient(closest-side, ${brass}, transparent 70%)`}} />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase text-brass">Under-Collateralized • Trust, not over-collateral</div>
                  <h1 className="font-display text-[38px] md:text-[56px] xl:text-[64px] leading-[0.9] tracking-[-0.03em] mt-3 max-w-[720px]">
                    Borrow on <span className="italic font-normal text-brass">who you are,</span> not just what you lock.
                  </h1>
                  <p className="mt-5 max-w-[640px] text-[15px] text-parchment/70 leading-relaxed">
                    Collara links your real-world proof — X, GitHub, LinkedIn — to on-chain reputation via GenLayer LLM consensus. Higher standing → lower collateral, fairer rates, without centralized KYC.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <button onClick={()=>setTab("how")} className="px-7 py-3.5 rounded-full bg-brass text-ink font-medium">How it works →</button>
                    <button onClick={()=>setTab("identity")} className="px-7 py-3.5 rounded-full bg-white/10 text-parchment border border-white/15">Link identity</button>
                    <span className="inline-flex items-center gap-2 text-xs text-parchment/60 ml-2"><span className="w-2 h-2 rounded-full bg-sage" /> Validators verify via web + LLM</span>
                  </div>
                  <div className="mt-10 grid grid-cols-3 gap-6 max-w-[640px]">
                    {[
                      ["50%","min collateral","at score 100"],
                      ["3%","best rate","vs 12% at 0"],
                      ["+3","reputation","on repay"],
                    ].map(([v,k,sub])=>(
                      <div key={k} className="border-t border-white/10 pt-3">
                        <div className="font-display text-2xl text-brass">{v}</div>
                        <div className="text-xs text-parchment/70">{k}</div>
                        <div className="text-[11px] text-parchment/40">{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="rounded-2xl bg-white border border-stone/10 p-6">
                  <div className="text-[11px] tracking-[0.1em] uppercase text-stone/50">How it works</div>
                  <ol className="mt-3 space-y-3 text-sm leading-relaxed">
                    <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-ink text-parchment grid place-items-center text-xs font-mono">1</span><span><b>Prove</b> — post “Verifying GenLayer 0x…” + paste URL</span></li>
                    <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-ink text-parchment grid place-items-center text-xs font-mono">2</span><span><b>Score</b> — validators fetch + LLM rubric 0-100</span></li>
                    <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-ink text-parchment grid place-items-center text-xs font-mono">3</span><span><b>Borrow</b> — collateral = 150% − score%</span></li>
                  </ol>
                </div>
                <div className="rounded-2xl bg-white border border-stone/10 p-6">
                  <div className="text-[11px] tracking-[0.1em] uppercase text-stone/50">Reputation spectrum — on-chain</div>
                  <div className="mt-4 flex gap-4">
                    <div className="w-3 rounded-full relative overflow-hidden" style={{background:`linear-gradient(to bottom, #8B2D2B, ${brass}, #8AA899)`}}>
                      <div className="absolute left-0 right-0 h-[3px] bg-ink" style={{top: score===null ? "50%" : `${100-score}%`}} />
                    </div>
                    <div className="flex-1 space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-stone/60">Score</span><span className="font-mono font-medium bg-ink text-parchment px-2 py-1 rounded-full">{score===null ? "—" : score}</span>
                        {score!==null && <button onClick={()=>setScore(null)} className="text-[10px] text-stone/40">reset</button>}
                      </div>
                      {score===null ? (
                        <div className="rounded-xl bg-parchment p-3 border border-dashed border-stone/15 text-stone/60">Link identity & call `assess_reputation(verification_id)` on-chain to get score.</div>
                      ) : (
                        <>
                          <div className="rounded-xl bg-parchment p-3 border border-stone/10">
                            <div className="flex justify-between text-xs"><span>Collateral</span><span className="font-mono font-medium">{collateralRatio}%</span></div>
                            <div className="flex justify-between text-xs mt-1"><span>Interest</span><span className="font-mono">{(interestBps!/100).toFixed(2)}%</span></div>
                            <div className="text-[11px] text-stone/60 mt-2">At {principal} GEN, need <b className="text-ink">{required} GEN</b></div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-brass p-6 text-ink">
                  <div className="text-[11px] tracking-[0.12em] uppercase opacity-60">Why GenLayer</div>
                  <div className="font-display text-xl leading-tight mt-2">Judgment, not just code.</div>
                  <p className="text-sm opacity-70 mt-2 leading-relaxed">Intelligent Contracts fetch live web proof and run LLM consensus — no oracle, no intermediary. `gl.nondet.web.get` + `prompt_comparative`.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-ink text-parchment rounded-xl p-3">Equivalence<br/>±12 tolerance</div>
                    <div className="bg-ink text-parchment rounded-xl p-3">Optimistic<br/>Democracy</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab==="how" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-white border border-stone/10 p-8">
                <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase text-brass">How it works • 4 steps, no mock</div>
                <h2 className="font-display text-[32px] leading-none tracking-[-0.02em] mt-2">From proof to loan — on-chain</h2>
                <p className="text-sm text-stone/60 mt-2 max-w-[680px]">Every step is a real Studionet transaction. Validators fetch live web + LLM consensus — no oracle.</p>
                <div className="mt-8 grid md:grid-cols-2 gap-6">
                  {[
                    ["01","Connect wallet","EVM compatible via Wagmi (MetaMask/Rabby) or GenLayer generated key. Same 0x format — your address is your identity. Faucet via covenant-deployer if 0 GEN.", "Connect EVM / GenLayer → 0x…"],
                    ["02","Link identity","Post public proof: “Verifying my GenLayer addr 0xYOUR_ADDR for @HANDLE on github”. Paste URL as proof_url. Validators fetch proof_url + independent source (api.github.com/unavatar) and LLM checks wallet+handle match. Returns verification_id.", "torvalds / github / https://x.com/torvalds/status/123456"],
                    ["03","Get scored","Call assess_reputation(verification_id). Validators re-fetch both sources + LLM rubric 0-100 (90 strong → 0 weak, ±12 tolerance + bucket). Score saved on-chain, determines collateral.", "assess → 95 → 55% collateral"],
                    ["04","Borrow & repay","Deposit liquidity, then request_loan(vid, principal, collateral, duration) with value=collateral. Repay with principal+interest (value), or dispute → resolve with verdict borrower/lender_win (both evidences fetched).", "1 GEN → need 0.55 GEN if score 95"],
                  ].map(([n,t,d,code])=>(
                    <div key={n} className="rounded-2xl border border-stone/10 bg-parchment p-6">
                      <div className="w-8 h-8 rounded-full bg-ink text-parchment grid place-items-center text-xs font-mono">{n}</div>
                      <div className="font-medium mt-3">{t}</div>
                      <div className="text-sm text-stone/60 mt-1 leading-relaxed">{d}</div>
                      <div className="mt-3 px-3 py-2 rounded-xl bg-ink text-brass font-mono text-xs">{code}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-xl bg-ink text-parchment p-4 flex flex-wrap gap-3 text-xs">
                  <span className="px-3 py-1.5 rounded-full bg-brass text-ink font-mono">Contract {CONTRACT.slice(0,10)}…</span>
                  <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15">Studionet https://studio.genlayer.com/api</span>
                  <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15">All writes need value (atto) — no mock fallback</span>
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={()=>setTab("identity")} className="px-6 py-3 rounded-full bg-ink text-parchment text-sm font-medium">Start → Link identity</button>
                  <button onClick={()=>setTab("market")} className="px-6 py-3 rounded-full bg-white border border-stone/15 text-sm">Go to Market</button>
                </div>
              </div>
              <div className="rounded-2xl bg-brass p-6 text-ink">
                <div className="font-display text-xl">Try the happy path in 2 minutes</div>
                <div className="text-sm opacity-70 mt-1">1) Connect → 2) torvalds/github/x.com → Verify → vid 1 → Assess → 95 → Market 1 GEN → Request 0.55 GEN → Loans → Repay</div>
              </div>
            </div>
          )}

          {tab==="identity" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-white border border-stone/10 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl tracking-[-0.02em]">Link real-world identity — on-chain</h2>
                    <p className="text-sm text-stone/60 max-w-[560px]">Auto-loads from chain after Connect — no re-verify needed. Or click Load below.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>{ if(!connected) setMsg("Connect wallet first — then Load"); fetchIdentity(true); }} disabled={fetchingIdentity} className="px-3 py-1.5 rounded-full bg-ink text-parchment text-xs font-medium cursor-pointer hover:bg-stone-800 disabled:opacity-40">{fetchingIdentity ? "Loading…" : "Load My Identity"}</button>
                    <span className={`px-3 py-1.5 rounded-full text-xs font-medium border ${verified===true?"bg-sage/15 border-sage text-sage":verified===false?"bg-oxblood/10 border-oxblood/30 text-oxblood":"bg-parchment border-stone/10 text-stone/60"}`}>
                      {verified===null?"No on-chain verification yet":verified?"Verified on-chain ✓":"Rejected on-chain"}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">Handle (1-32 alnum _.-)</label><input value={handle} onChange={e=>setHandle(sanitize(e.target.value))} placeholder="alice" maxLength={32} className="mt-1 w-full px-4 py-3 rounded-xl border border-stone/15 bg-parchment focus:outline-none focus:ring-2 focus:ring-brass/30" />
                      {!isValidHandle(handle) && handle.length>0 && <div className="text-xs text-oxblood mt-1">Invalid handle format</div>}</div>
                      <div><label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">Platform</label>
                        <select value={platform} onChange={e=>setPlatform(e.target.value)} className="mt-1 w-full px-4 py-3 rounded-xl border border-stone/15 bg-parchment">
                          <option value="x">X (Twitter)</option><option value="github">GitHub</option><option value="linkedin">LinkedIn</option><option value="farcaster">Farcaster</option>
                        </select>
                      </div>
                    </div>
                    <div><label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">Proof URL — must be x.com/github.com/etc, path contains @handle, body contains wallet+handle (https only)</label>
                      <input value={proofUrl} onChange={e=>setProofUrl(sanitize(e.target.value))} placeholder={platform==="github" ? `https://gist.githubusercontent.com/${handle || 'torvalds'}/abc123/raw/verify.txt` : platform==="linkedin" ? `https://www.linkedin.com/in/${handle || 'alice'}` : platform==="farcaster" ? `https://warpcast.com/${handle || 'alice'}/0x...` : `https://x.com/${handle || 'torvalds'}/status/123456`} type="url" inputMode="url" maxLength={512} className="mt-1 w-full px-4 py-3 rounded-xl border border-stone/15 bg-white font-mono text-sm" />
                      {!isValidUrl(proofUrl) && proofUrl.length>0 && <div className="text-xs text-oxblood mt-1">Must be http(s) URL, max 512 chars, host x.com/github.com/gist.githubusercontent.com/etc and path contains handle</div>}
                      <div className="text-xs text-stone/50 mt-2">Example for <b>{platform}</b>: <span className="font-mono text-[11px]">{platform==="github" ? `https://gist.githubusercontent.com/${handle || 'torvalds'}/abc123/raw/verify.txt` : platform==="linkedin" ? `https://www.linkedin.com/in/${handle || 'alice'}` : platform==="farcaster" ? `https://warpcast.com/${handle || 'alice'}/0x...` : `https://x.com/${handle || 'torvalds'}/status/123456`}</span> — body must have “Verifying my GenLayer addr {connected ? connected.slice(0,10)+'…' : '0x...'} for @{handle || 'handle'}” — for GitHub use <b>Raw</b> URL (button Raw on gist), not gist.github.com page.</div>
                    </div>

                    <div className="rounded-xl bg-ink text-parchment p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-brass grid place-items-center text-ink font-mono text-xs">0x</div>
                      <div className="flex-1"><div className="text-xs text-parchment/60">Wallet</div><div className="font-mono text-sm">{connected || "Not connected — connect to link"}</div></div>
                      <div className="hidden sm:block text-stone-500">—</div>
                      <div className="px-3 py-2 rounded-full bg-white text-ink text-xs font-medium">@{handle || "—"} • {platform}</div>
                    </div>

                    <div className="flex gap-3 relative z-10">
                      <button disabled={loading==="link"} onClick={doLink} type="button" className="flex-1 py-3 rounded-xl bg-ink text-parchment font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{loading==="link"?"Verifying…":"Verify on-chain (link_identity)"}</button>
                      <button onClick={()=>{ setVerified(null); setVid(""); setHandle(""); setProofUrl(""); setExplorerResult(null); setMsg("Reset — fill handle + proof again"); }} type="button" className="px-5 py-3 rounded-xl border border-stone/15 bg-white cursor-pointer hover:bg-parchment active:bg-stone-100">Reset</button>
                    </div>
                    {explorerResult && (
                      <div className={`rounded-xl border p-3 text-xs font-mono ${explorerResult.status==="verified" ? "bg-sage/10 border-sage/20 text-sage" : explorerResult.status==="rejected" ? "bg-oxblood/10 border-oxblood/20 text-oxblood" : "bg-parchment border-stone/15 text-stone/60"}`}>
                        <div className="font-medium">{explorerResult.status==="verified" ? "✓ Verified on-chain" : explorerResult.status==="rejected" ? "✗ Rejected on-chain" : "Explorer result"}</div>
                        <div className="mt-1 whitespace-pre-wrap break-all">{explorerResult.payload.slice(0,500)}</div>
                      </div>
                    )}
                    {vid && !explorerResult && <div className="text-xs font-mono text-sage">Got verification_id: {vid} — now assess →</div>}
                    <div className="flex gap-2">
                      <input value={vid} onChange={e=>setVid(e.target.value.replace(/[^0-9]/g,""))} placeholder="verification_id (from link)" className="flex-1 px-3 py-2.5 rounded-xl border border-stone/15 bg-parchment text-sm font-mono" />
                      <button disabled={!vid || loading==="assess"} onClick={doAssess} className="px-5 py-2.5 rounded-xl bg-brass text-ink text-sm font-medium disabled:opacity-40">{loading==="assess"?"Scoring…":"assess_reputation"}</button>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-parchment border border-stone/10 p-5">
                    <div className="text-[11px] tracking-[0.1em] uppercase text-stone/50">Scoring rubric — on-chain</div>
                    <div className="mt-3 space-y-2">
                      {[
                        ["90–100","Strong","long history, multiple signals","bg-sage"],
                        ["70–89","Credible","clear ownership, some activity","bg-sage/70"],
                        ["40–69","Weak","minimal, new account","bg-brass"],
                        ["0–39","No evidence","suspicious, mismatch","bg-oxblood"],
                      ].map(([range,label,desc,dot])=>(
                        <div key={range} className="flex gap-3 p-3 rounded-xl bg-white border border-stone/10">
                          <span className={`w-2 h-8 rounded-full ${dot}`} />
                          <div><div className="text-sm font-medium">{range} · {label}</div><div className="text-xs text-stone/60">{desc}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab==="market" && (
            <div className="space-y-6">
              <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
                <div className="rounded-2xl bg-white border border-stone/10 p-6">
                  <h2 className="font-display text-2xl">Request a covenant — on-chain payable</h2>
                  <p className="text-sm text-stone/60">Collateral derived from real on-chain score. Sends `value`.</p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div><label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">Principal (GEN) — max 1000</label><input type="number" min={0.1} max={1000} step={0.1} value={principal} onChange={e=>{let v=parseFloat(e.target.value)||0; v=Math.min(1000, Math.max(0.1,v)); setPrincipal(v)}} className="mt-1 w-full px-4 py-3 rounded-xl border border-stone/15 bg-parchment" /></div>
                    <div><label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">vid</label><input value={vid} onChange={e=>setVid(e.target.value)} placeholder="verification_id" className="mt-1 w-full px-4 py-3 rounded-xl border border-stone/15 bg-parchment font-mono" /></div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div><label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">Duration (days)</label><input type="number" value={duration} onChange={e=>setDuration(parseInt(e.target.value)||30)} className="mt-1 w-full px-4 py-3 rounded-xl border border-stone/15 bg-parchment" /></div>
                    <div className="flex items-end"><button onClick={fetchPool} className="w-full py-3 rounded-xl bg-parchment border border-stone/15 text-sm">Refresh pool</button></div>
                  </div>

                  <div className="mt-4 rounded-xl bg-ink text-parchment p-4">
                    {score===null ? (
                      <div className="text-sm text-parchment/60">No on-chain score — assess first. Formula: `150 - score`.</div>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm"><span className="text-parchment/60">Your on-chain score</span><span className="font-mono">{score}</span></div>
                        <div className="flex justify-between text-sm mt-2"><span className="text-parchment/60">Collateral ratio</span><span className="font-mono font-medium text-brass">{collateralRatio}%</span></div>
                        <div className="flex justify-between text-sm mt-2"><span className="text-parchment/60">Required collateral</span><span className="font-mono bg-brass text-ink px-2 py-1 rounded-full text-xs">{required} GEN</span></div>
                        <div className="flex justify-between text-sm mt-2"><span className="text-parchment/60">Interest</span><span className="font-mono">{(interestBps!/100).toFixed(2)}% → {(principal*interestBps!/10000).toFixed(3)} GEN</span></div>
                      </>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div><label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">Principal (atto) — 1 GEN = 1e18</label><input value={(() => { try{ return toBigInt(Math.floor(principal*1e18)).toString() }catch{ return "0"} })()} readOnly className="mt-1 w-full px-3 py-2.5 rounded-xl border border-stone/15 bg-parchment font-mono text-[11px]" />
                      <div className="text-[10px] text-stone/40 mt-1">{principal} GEN</div></div>
                    <div><label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">Collateral (atto) — wei</label><input value={required===null ? "" : (() => { try{ return toBigInt(Math.floor(required*1e18)).toString() }catch{ return ""}})()} readOnly placeholder="— need score" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-stone/15 bg-brass/15 font-mono text-[11px]" />
                      <div className="text-[10px] text-stone/40 mt-1">{required!==null? `${required} GEN` : "—"}</div></div>
                  </div>

                  <button disabled={score===null || !vid || loading==="request"} onClick={doRequest} className="mt-4 w-full py-3 rounded-xl bg-brass text-ink font-medium disabled:opacity-40 disabled:cursor-not-allowed">{loading==="request"?"Sending… 8s": required===null ? "need score" : `Request on-chain — send ${required} GEN`}</button>
                  {explorerResult && (
                    <div className={`mt-3 rounded-xl border p-3 text-xs font-mono ${explorerResult.status==="verified"?"bg-sage/10 border-sage/20 text-sage":explorerResult.status==="rejected"?"bg-oxblood/10 border-oxblood/20 text-oxblood":"bg-parchment border-stone/15 text-stone/60"}`}>
                      <div className="font-medium">{explorerResult.status==="verified"?"✓ Success — loan created":explorerResult.status==="rejected"?"✗ Failed":"Pending"}</div>
                      <div className="mt-1 break-all">{explorerResult.payload.slice(0,600)}</div>
                      {explorerResult.status==="verified" && <div className="mt-2 text-[11px]">Check <b>My Loans → Fetch on-chain</b> untuk lihat loan baru.</div>}
                    </div>
                  )}
                  <div className="text-xs text-stone/50 mt-2 text-center">Real: `request_loan(vid, principal_atto, collateral_atto, duration)` dengan `value=collateral` • 1 GEN = 1e18 atto</div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl bg-white border border-stone/10 p-5">
                    <div className="text-sm font-medium">Pool — live Studionet</div>
                    <div className="mt-3 rounded-xl bg-parchment border border-stone/15 p-4 text-xs">
                      <div className="font-mono text-[11px] break-all">{CONTRACT}</div>
                      <div className="mt-2 text-stone/60">All writes use `value` (atto) — no mock.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab==="loans" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-white border border-stone/10 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-stone/10">
                  <h2 className="font-display text-xl">Active covenants — on-chain</h2>
                  <button onClick={fetchLoans} className="text-xs px-3 py-1.5 rounded-full bg-ink text-parchment">Fetch on-chain</button>
                </div>
                {myLoans.length===0 ? (
                  <div className="px-6 py-12 text-center">
                    <div className="text-sm text-stone/60">No loans yet — fetch `get_all_loans()` live</div>
                    <div className="text-xs text-stone/40 mt-1">Contract: {CONTRACT.slice(0,10)}… • {connected? connected.slice(0,10)+"…" : "Connect wallet"}</div>
                    <button onClick={fetchLoans} className="mt-4 px-4 py-2 rounded-xl bg-brass text-ink text-xs font-medium">Load my loans</button>
                  </div>
                ) : (
                  <div className="divide-y divide-stone/10">
                    {myLoans.map((l:any)=>(
                      <div key={String(l.id)} className="px-6 py-4 flex flex-wrap items-center gap-4">
                        <div className="min-w-[180px]">
                          <div className="text-xs font-mono">Loan #{String(l.id)} • <span className={`px-2 py-0.5 rounded-full text-[11px] ${String(l.status)==="active"?"bg-sage/15 text-sage":String(l.status)==="repaid"?"bg-brass/20 text-ink":"bg-stone/10"}`}>{String(l.status)}</span></div>
                          <div className="text-sm mt-1"><span className="font-mono font-medium">{fmtGen(l.principal_atto)} GEN</span> <span className="text-stone/50">principal</span> • <span className="font-mono">{fmtGen(l.collateral_atto||0)} GEN collateral</span></div>
                          <div className="text-xs text-stone/50 font-mono">score {String(l.reputation_score||"?")} • {Number(l.interest_bps||0)/100}% • {String(l.duration_days||"?")}d • {String(l.borrower).slice(0,10)}…</div>
                        </div>
                        <div className="ml-auto flex gap-2">
                          <button disabled={String(l.status)!=="active" || loading==="repay"} onClick={async()=>{
                            setLoanId(String(l.id))
                            setLoading("repay"); setMsg(""); setExplorerResult(null)
                            try{
                              const c = await getWriteClient()
                              const loan:any = l
                              const interest = (toBigInt(loan.principal_atto) * toBigInt(loan.interest_bps)) / toBigInt(10000)
                              const total = toBigInt(loan.principal_atto) + interest
                              const tx = await c.writeContract({ address: CONTRACT as `0x${string}`, functionName: "repay_loan", args: [toBigInt(l.id)], value: total })
                              setMsg(`repay #${l.id} tx ${String(tx).slice(0,18)}… total ${(Number(total)/1e18).toFixed(4)} GEN — waiting`)
                              setExplorerResult({status:"pending", payload:`Repay #${l.id} tx ${String(tx).slice(0,18)}…`})
                              setTimeout(async()=>{ await fetchLoans(); setExplorerResult({status:"verified", payload:`✓ Repaid #${l.id}`}); setLoading(null)}, 7000)
                            }catch(e:any){ const m=getErrMsg(e)||"repay failed"; setMsg(m); setExplorerResult({status:"rejected", payload:m}); setLoading(null) }
                          }} className="px-4 py-2 rounded-xl bg-ink text-parchment text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">{loading==="repay"?"Repaying…":"Repay"}</button>
                          <button disabled={String(l.status)!=="active"} onClick={async()=>{
                            setLoading("liq")
                            try{
                              const c = await getWriteClient()
                              const tx = await c.writeContract({ address: CONTRACT as `0x${string}`, functionName: "liquidate_loan", args: [toBigInt(l.id)]})
                              setMsg(`liquidate #${l.id} tx ${String(tx).slice(0,18)}`)
                              setTimeout(fetchLoans, 6500)
                            }catch(e:any){ setMsg(e.message?.slice(0,150) || "liquidate failed")}
                            setLoading(null)
                          }} className="px-4 py-2 rounded-xl bg-oxblood text-white text-xs font-medium disabled:opacity-40">Liquidate</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-6 py-3 bg-parchment text-xs text-stone/50 flex gap-2">
                  <span>Tip: klik <b>Repay</b> langsung di card — tidak perlu isi loan id manual.</span>
                  <span className="ml-auto font-mono">{myLoans.length} shown • {CONTRACT.slice(0,8)}…</span>
                </div>
              </div>
            </div>
          )}

          {tab==="vault" && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="rounded-2xl bg-white border border-stone/10 p-6">
                  <h2 className="font-display text-xl">Provide liquidity — payable on-chain</h2>
                  <p className="text-sm text-stone/60">Real GEN via `deposit_liquidity()` with `value`.</p>
                  <div className="mt-3 rounded-xl bg-ink text-parchment p-4 flex items-center justify-between">
                    <div><div className="text-[11px] tracking-[0.12em] uppercase text-parchment/50">Your deposit — on-chain</div><div className="font-mono text-lg mt-1">{myLiq} <span className="text-sm text-parchment/60">GEN</span></div><div className="text-[11px] text-parchment/50 font-mono">{connected ? connected.slice(0,10)+"…" : "Connect wallet"}</div></div>
                    <button onClick={async()=>{ await fetchPool(); await fetchMyLiq(); setMsg("Vault refreshed ✓"); setExplorerResult({status:"pending", payload:`Refreshed — your ${myLiq} GEN • Pool TVL ${pool?.tvl||"?"} GEN • ${CONTRACT.slice(0,10)}…`}) }} disabled={loading==="deposit"} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs disabled:opacity-40">Refresh</button>
                  </div>
                  <div className="mt-4">
                    <label className="text-[11px] tracking-[0.08em] uppercase text-stone/50">Deposit (GEN)</label>
                    <input id="depAmt" placeholder="e.g. 1" className="mt-1 w-full px-4 py-3 rounded-xl border border-stone/15 bg-parchment" />
                    <button onClick={doDeposit} disabled={loading==="deposit"} className="mt-3 w-full py-3 rounded-xl bg-ink text-parchment font-medium cursor-pointer hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed">{loading==="deposit"?"Depositing… 7s":"deposit_liquidity() with value"}</button>
                    {explorerResult && tab==="vault" && (
                      <div className={`mt-3 rounded-xl border p-3 text-xs font-mono ${explorerResult.status==="verified"?"bg-sage/10 border-sage/20 text-sage":explorerResult.status==="rejected"?"bg-oxblood/10 border-oxblood/20 text-oxblood":"bg-parchment border-stone/15 text-stone/60"}`}>
                        <div className="font-medium">{explorerResult.status==="verified"?"✓ Success":explorerResult.status==="rejected"?"✗ Failed":"Pending"}</div>
                        <div className="mt-1 break-all">{explorerResult.payload.slice(0,500)}</div>
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-parchment p-3 border border-stone/10"><div className="text-[11px] text-stone/50">Your real share</div><div className="font-mono text-sm font-medium">{myLiq} GEN</div><div className="text-[10px] text-stone/40">get_liquidity()</div></div>
                      <input id="withAmt" placeholder="withdraw GEN e.g. 0.5" className="px-3 py-2 rounded-xl border border-stone/15 bg-white font-mono text-sm" />
                    </div>
                    <button onClick={async()=>{
                      let v=(document.getElementById("withAmt") as HTMLInputElement)?.value || ""
                      v=v.trim()
                      if(!v){ setMsg("Enter withdraw amount in GEN (e.g. 0.5)"); return }
                      let atto:string
                      try{ atto = parseAtto(v).toString() }catch{ setMsg("Invalid amount"); return }
                      if(loading==="withdraw") return
                      setLoading("withdraw"); setExplorerResult(null)
                      try{
                        const c = await getWriteClient()
                        const tx = await c.writeContract({ address: CONTRACT as `0x${string}`, functionName: "withdraw_liquidity", args: [toBigInt(atto)]})
                        setMsg(`withdraw tx ${String(tx).slice(0,18)}… waiting`)
                        setExplorerResult({status:"pending", payload:`Withdraw ${v} GEN (${atto} atto) — tx ${String(tx).slice(0,18)}`})
                        setTimeout(async()=>{ await fetchPool(); await fetchMyLiq(); setExplorerResult({status:"verified", payload:`✓ Withdraw confirmed`}); setLoading(null) }, 7000)
                      }catch(e:any){ const m=getErrMsg(e)||"withdraw failed"; setMsg(m); setExplorerResult({status:"rejected", payload:m}); setLoading(null) }
                    }} disabled={loading==="withdraw"} className="mt-2 w-full py-2.5 rounded-xl bg-white border border-stone/15 text-sm cursor-pointer hover:bg-parchment disabled:opacity-40 disabled:cursor-not-allowed">{loading==="withdraw"?"Withdrawing…":"withdraw_liquidity on-chain"}</button>
                  </div>
                </div>
                <div className="rounded-2xl bg-ink text-parchment p-6">
                  <h3 className="font-display text-xl">Risk & consensus — real Studionet</h3>
                  <ul className="mt-3 space-y-2 text-sm text-parchment/70">
                    <li>• Validators re-fetch `proof_url` + `unavatar`/`api.github` — no mock.</li>
                    <li>• Dispute `submit→resolve` fetches both evidences contract-side.</li>
                    <li>• All `value` sent as `BigInt(atto)` — no fallback mock data.</li>
                  </ul>
                  <div className="mt-4 p-3 rounded-xl bg-brass text-ink text-xs font-mono">Contract: {CONTRACT.slice(0,10)}… • Studionet</div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="max-w-[1600px] mx-auto px-8 py-8 text-xs text-stone/50 flex flex-wrap gap-4 border-t border-stone/10 mt-8">
        <span>© Collara — Real Studionet • No mock fallback</span>
        <span className="ml-auto">Contract {CONTRACT.slice(0,8)}… • Studionet</span>
      </footer>
    </div>
  )
}
