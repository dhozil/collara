# Under-Collateralized Lending on GenLayer

**Enable lending with less collateral by linking real-world identity to on-chain reputation — allowing borrowers to leverage good standing for better loan terms.**

Built with **GenLayer Intelligent Contracts** (Python + LLM consensus + Web Access).

## Why GenLayer?

Over-collateralized lending (150%+) is inefficient. Traditional under-collateralized lending needs KYC/credit score — centralized & not trustless. 

GenLayer solves this via:
- `gl.nondet.web.get(proof_url)` — validator verifies social proof (X/GitHub/LinkedIn post containing wallet)
- `gl.nondet.exec_prompt(..., response_format="json")` — LLM scores reputation 0-100 with explicit rubric
- **Optimistic Democracy + Equivalence Principle** — validators rerun LLM/web task and compare `verified` boolean & score bucket (±12 tolerance) — no single leader can fake reputation
- `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` — custom validator with strict error classification (`[EXPECTED]/[EXTERNAL]/[TRANSIENT]/[LLM_ERROR]`)

## Contract: `contracts/reputation_lending.py`

Pinned runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`

### Storage
| Field | Type | Notes |
|---|---|---|
| `owner` | `Address` | deployer |
| `total_liquidity_atto` | `u256` | pool TVL (wei) |
| `liquidity_balances` | `TreeMap[Address,u256]` | lender deposits |
| `reputation_scores` | `TreeMap[Address,u256]` | 0-100 |
| `identity_proofs` | `TreeMap[Address,IdentityProof]` | verified handle/platform/proof_url |
| `loans` | `TreeMap[u256,Loan]` | on-chain loan ledger |
| `loan_ids` | `DynArray[u256]` | ordering |

### Core Methods
- `deposit_liquidity() payable` / `withdraw_liquidity(amount)` — pool funding via GEN value transfers (`_EoaTransfer.emit_transfer`)
- `link_identity(handle, platform, proof_url)` — **nondet**: fetch proof_url + LLM verify wallet↔handle linkage (strict: must mention wallet or GenLayer+handle)
- `assess_reputation(borrower)` — **nondet**: LLM rubric 90-100 strong / 70-89 credible / 40-69 weak / 0-39 suspicious; validator tolerance ±12 & bucket check
- `request_loan(principal, collateral, duration) payable` — deterministic: `required = principal * (15000 - score*100)/10000` → score 80 = 70% collateral; score 100 = 50% minimum; interest `1200 - score*8 bps` (12%→3%)
- `repay_loan(id) payable` / `liquidate_loan(id)` + reputation bonus/penalty (±3 / -15)

### Value Flow
Using `gl.evm.contract_interface` + `emit_transfer(value)` per [Value Transfers docs](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers) — immediately deducted, credited on `finalized`.

## Quick Start

```bash
# 1. Studio (browser) — https://studio.genlayer.com
# Paste contracts/reputation_lending.py → Deploy

# 2. Local
pip install genlayer-test
genlayer up  # if genlayer CLI installed

# 3. Tests (direct mode, no Docker, 600ms)
python -m pytest tests -v

# 4. Lint
genvm-lint check contracts/reputation_lending.py --json
```

## Test Coverage (10 tests, all passing)
- pool init, deposit/withdraw accounting
- identity verification success/reject via mocked web+LLM
- reputation scoring & consensus tolerance
- under-collateralized loan (score 80 → 70% collateral, not 150%)
- insufficient collateral rejection
- repay with interest + reputation bonus
- liquidate penalty
- admin override

See `tests/test_reputation_lending.py` for mock patterns:
```python
direct_vm.mock_web(r".*", {"status":200, "body":"...", "method":"GET"})
direct_vm.mock_llm(r".*", json.dumps({"verified": True, ...}))
with direct_vm.prank(borrower):
    c.link_identity(...)
direct_vm.value = amount  # for payable
c.request_loan(...)
```

## Frontend
`frontend/index.html` — vanilla JS + `genlayer-js` example. Connect wallet, link identity (paste proof URL from your X post: "Verifying my GenLayer addr 0x... for @handle"), assess, request loan with auto-calculated collateral slider, repay/liquidate.

## Deployment

```bash
# Studionet / Testnet Asimov / Bradbury via genlayer-js
import { createClient, createAccount } from 'genlayer-js'
import { testnetAsimov } from 'genlayer-js/chains'
const client = createClient({chain: testnetAsimov, account: createAccount(...)})
const { address } = await client.deployContract({ abi, bytecode, args: [] })
```

Faucet: https://testnet-faucet.genlayer.foundation

## Architecture Notes
- **Frontend owns**: UI, proof URL collection, collateral math preview, indexing
- **Contract owns**: verification consensus, scoring, collateral ratio enforcement, loan state, appeal path via re-`assess_reputation`
- **External owns**: X/GitHub pages — validators re-fetch, never trust leader body

## Roadmap
- Add ZK proof for private identity (e.g. ENS + WorldID)
- Oracle price feed for liquidation LTV via `strict_eq` on stable API
- Factory per-loan child contracts for isolated collateral

## Lint
```
genvm-lint: lint ok true (3 passed)
validate: requires runner tar locally — ok on GenLayer network with pinned hash
```
