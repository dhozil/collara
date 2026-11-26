# Collara Milestone — Credit Profile, Collateral Top-Up, and Loan Transparency

**Baseline (old):** `8b0651a` — share pool + no owner timestamp + multi-lender solvency, 26 tests, basic loan cards.  
**Milestone (new):** this commit — meaningful new contract functionality, new views, frontend credit profile + top-up flow, 30 tests.

## What Changed (Old vs New)

| Area | Old | New (Improved) |
|---|---|---|
| Borrower history | No on-chain borrower history/profile | New `BorrowerProfile` storage + `get_borrower_profile(account)` view: total borrowed/repaid/interest paid, loans requested/repaid/defaulted/liquidated/forgiven, active loans, last score |
| Collateral management | Borrower could not add collateral after loan creation | New `top_up_collateral(loan_id)` payable write: borrower can increase collateral on active loan to reduce liquidation risk |
| Loan visibility | `get_loan` returned basic fields only; `get_all_loans` minimal | `get_loan` now returns `interest_atto`, `fee_atto`, `total_due_atto`, `is_expired`; `get_all_loans` returns enriched loan rows for market/activity view |
| Profile tracking | Repay/liquidate/default/dispute did not build borrower credit history | Profile counters updated on `request_loan`, `repay_loan`, `liquidate_loan`, `timeout_settle`, `resolve_dispute` (borrower_win/lender_win) |
| Frontend loans | Loan card showed principal/collateral/score/interest/duration | Loan card shows **total due**, **Top up** action, and refreshed on-chain state after repay/liquidate/top-up |
| Frontend identity | Identity tab had verification + rubric only | Identity tab adds **Borrower Credit Profile** card (borrowed, repaid, interest paid, active, repaid/defaulted, liquidated/forgiven) from `get_borrower_profile` |
| Tests | 26 passed | **30 passed** (`python -m pytest tests -v`) including 4 new milestone tests |

## Contract Changes (`contracts/reputation_lending.py`)

- Added `BorrowerProfile` dataclass and `borrower_profiles: TreeMap[Address, BorrowerProfile]`.
- Added `_profile_of()` internal helper and `get_borrower_profile(account)` view.
- Added `top_up_collateral(loan_id)` payable write (active loan, borrower-only, value > 0).
- Enriched `get_loan()` with `interest_atto`, `fee_atto`, `total_due_atto`, `is_expired`.
- Enriched `get_all_loans()` with collateral, score, interest bps, total due, duration, expiry.
- Updated profile accounting in `request_loan`, `repay_loan`, `liquidate_loan`, `timeout_settle`, and `resolve_dispute`.

## Frontend Changes (`frontend/app/page.tsx`)

- Added `profile` state + `fetchProfile()` reading `get_borrower_profile`.
- Added Borrower Credit Profile card in Identity tab with refresh.
- Added `Top up` action on active loan cards (`top_up_collateral` + receipt wait + on-chain refresh).
- Loan cards display total due; fetch flow refreshes profile after loans load.
- Build verified: `npm run build` passes.

## New Tests (`tests/test_milestone.py`)

- `test_borrower_profile_tracks_lifecycle` — profile updates through request/repay.
- `test_top_up_collateral_increases_loan_collateral` — top-up increases collateral on active loan.
- `test_get_loan_returns_total_due_and_interest` — enriched loan view fields.
- `test_get_all_loans_enriched` — enriched all-loans entries.

## Verification

```bash
python -m pytest tests -v
# 30 passed

cd frontend
npm run build
# build passes
```

## Notes

- Existing security/solvency invariants preserved: share pool accounting, fail-closed timestamp checks, receipt+read verification before frontend success, no mock/fallback data paths.
- This milestone is code-complete and test-verified; deploy the updated contract to Studionet before publishing the new live contract address for production use.
