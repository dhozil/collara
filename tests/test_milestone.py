import json
import datetime


def _addr(i: int) -> bytes:
    return b"\x00" * 19 + bytes([i + 1])


def _warp_to(direct_vm, unix_ts: int):
    iso = datetime.datetime.fromtimestamp(unix_ts, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    direct_vm.warp(iso)


def test_borrower_profile_tracks_lifecycle(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    from genlayer.py.types import Address
    lender = Address(_addr(90))
    borrower = Address(_addr(91))
    with direct_vm.prank(lender):
        direct_vm.value = 10_000_000_000_000_000_000
        c.deposit_liquidity()
        direct_vm.value = 0
    with direct_vm.prank(borrower):
        direct_vm.mock_web(r".*", {"status": 200, "body": "alice proof wallet", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
        vid = c.link_identity(handle="alicep", platform="x", proof_url="https://x.com/alicep/status/1")
    with direct_vm.prank(borrower):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*", {"status": 200, "body": "alice profile", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"score": 80, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
        c.assess_reputation(vid)
    with direct_vm.prank(borrower):
        direct_vm.value = 700_000_000_000_000_000
        c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=700_000_000_000_000_000, duration_days=30)
        direct_vm.value = 0
    p = c.get_borrower_profile(borrower)
    assert p["loans_requested"] == 1
    assert p["active_loans"] == 1
    assert p["total_borrowed_atto"] == 1_000_000_000_000_000_000
    assert p["loans_repaid"] == 0

    interest = 1_000_000_000_000_000_000 * (1200 - 80 * 8) // 10000
    with direct_vm.prank(borrower):
        direct_vm.value = 1_000_000_000_000_000_000 + interest
        c.repay_loan(1)
        direct_vm.value = 0
    p2 = c.get_borrower_profile(borrower)
    assert p2["loans_repaid"] == 1
    assert p2["active_loans"] == 0
    assert p2["total_repaid_atto"] == 1_000_000_000_000_000_000
    assert p2["total_interest_paid_atto"] == interest
    assert p2["score"] >= 80


def test_top_up_collateral_increases_loan_collateral(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    from genlayer.py.types import Address
    lender = Address(_addr(92))
    borrower = Address(_addr(93))
    with direct_vm.prank(lender):
        direct_vm.value = 10_000_000_000_000_000_000
        c.deposit_liquidity()
        direct_vm.value = 0
    with direct_vm.prank(borrower):
        direct_vm.mock_web(r".*", {"status": 200, "body": "topup proof", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
        vid = c.link_identity(handle="topup", platform="x", proof_url="https://x.com/topup/status/1")
    with direct_vm.prank(borrower):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*", {"status": 200, "body": "profile", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"score": 70, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
        c.assess_reputation(vid)
    with direct_vm.prank(borrower):
        direct_vm.value = 800_000_000_000_000_000
        c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=800_000_000_000_000_000, duration_days=30)
        direct_vm.value = 0
    before = c.get_loan(1)
    assert int(before["collateral_atto"]) == 800_000_000_000_000_000
    with direct_vm.prank(borrower):
        direct_vm.value = 200_000_000_000_000_000
        c.top_up_collateral(1)
        direct_vm.value = 0
    after = c.get_loan(1)
    assert int(after["collateral_atto"]) == 1_000_000_000_000_000_000
    assert after["status"] == "active"


def test_get_loan_returns_total_due_and_interest(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    from genlayer.py.types import Address
    lender = Address(_addr(94))
    borrower = Address(_addr(95))
    with direct_vm.prank(lender):
        direct_vm.value = 10_000_000_000_000_000_000
        c.deposit_liquidity()
        direct_vm.value = 0
    with direct_vm.prank(borrower):
        direct_vm.mock_web(r".*", {"status": 200, "body": "due proof", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
        vid = c.link_identity(handle="dueuser", platform="x", proof_url="https://x.com/dueuser/status/1")
    with direct_vm.prank(borrower):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*", {"status": 200, "body": "profile", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"score": 80, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
        c.assess_reputation(vid)
    with direct_vm.prank(borrower):
        direct_vm.value = 700_000_000_000_000_000
        c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=700_000_000_000_000_000, duration_days=30)
        direct_vm.value = 0
    loan = c.get_loan(1)
    interest = 1_000_000_000_000_000_000 * (1200 - 80 * 8) // 10000
    assert int(loan["interest_atto"]) == interest
    assert int(loan["total_due_atto"]) == 1_000_000_000_000_000_000 + interest
    assert "is_expired" in loan


def test_get_all_loans_enriched(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    from genlayer.py.types import Address
    lender = Address(_addr(96))
    borrower = Address(_addr(97))
    with direct_vm.prank(lender):
        direct_vm.value = 10_000_000_000_000_000_000
        c.deposit_liquidity()
        direct_vm.value = 0
    with direct_vm.prank(borrower):
        direct_vm.mock_web(r".*", {"status": 200, "body": "enrich proof", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
        vid = c.link_identity(handle="enrich", platform="x", proof_url="https://x.com/enrich/status/1")
    with direct_vm.prank(borrower):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*", {"status": 200, "body": "profile", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"score": 75, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
        c.assess_reputation(vid)
    with direct_vm.prank(borrower):
        direct_vm.value = 750_000_000_000_000_000
        c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=750_000_000_000_000_000, duration_days=14)
        direct_vm.value = 0
    loans = c.get_all_loans()
    assert len(loans) == 1
    l = loans[0]
    assert l["status"] == "active"
    assert "total_due_atto" in l
    assert "collateral_atto" in l
    assert "interest_bps" in l
