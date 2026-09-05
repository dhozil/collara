import json

def _addr(i: int) -> bytes:
    return b"\x00" * 19 + bytes([i + 1])

def test_fee_withdraw_does_not_double_charge_lenders(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    pool_before = c.get_pool_stats()["total_liquidity_atto"]
    from genlayer.py.types import Address
    lender = Address(direct_vm.sender)
    bal_before = c.get_liquidity(lender)["balance_atto"]
    assert bal_before == 10_000_000_000_000_000_000
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    vid = c.link_identity(handle="gail", platform="x", proof_url="https://x.com/gail/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 80, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
    c.assess_reputation(vid)
    direct_vm.value = 700_000_000_000_000_000
    c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=700_000_000_000_000_000, duration_days=30)
    direct_vm.value = 0
    pool_after_loan = c.get_pool_stats()["total_liquidity_atto"]
    assert pool_after_loan == pool_before - 1_000_000_000_000_000_000
    interest = 1_000_000_000_000_000_000 * (1200 - 80*8) // 10000
    fee = interest // 10
    total = 1_000_000_000_000_000_000 + interest
    direct_vm.value = total
    c.repay_loan(1)
    direct_vm.value = 0
    fees = c.get_platform_fees()["fees_atto"]
    assert fees == fee
    pool_after_repay = c.get_pool_stats()["total_liquidity_atto"]
    assert pool_after_repay == pool_after_loan + 1_000_000_000_000_000_000 + (interest - fee)
    bal_after_repay = c.get_liquidity(lender)["balance_atto"]
    assert bal_after_repay == bal_before
    c.owner_withdraw_fees(fee)
    assert c.get_platform_fees()["fees_atto"] == 0
    pool_after_withdraw = c.get_pool_stats()["total_liquidity_atto"]
    assert pool_after_withdraw == pool_after_repay
    assert c.get_liquidity(lender)["balance_atto"] == bal_before

def test_liquidation_fails_closed_without_timestamp(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    vid = c.link_identity(handle="frank", platform="x", proof_url="https://x.com/frank/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 70, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
    c.assess_reputation(vid)
    direct_vm.value = 800_000_000_000_000_000
    c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=800_000_000_000_000_000, duration_days=30)
    direct_vm.value = 0
    pool_before = c.get_pool_stats()["total_liquidity_atto"]
    loan_before = c.get_loan(1)
    try:
        c.liquidate_loan(1)
        assert False, "should fail closed without valid timestamp"
    except Exception as e:
        assert "Cannot verify expiry" in str(e) or "not expired" in str(e).lower()
    assert c.get_loan(1)["status"] == "active"
    assert c.get_pool_stats()["total_liquidity_atto"] == pool_before
    assert loan_before["collateral_atto"] == c.get_loan(1)["collateral_atto"]

def test_borrower_win_dispute_does_not_create_liquidity(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof wallet", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    vid = c.link_identity(handle="alice", platform="x", proof_url="https://x.com/alice/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 70, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
    c.assess_reputation(vid)
    direct_vm.value = 800_000_000_000_000_000
    c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=800_000_000_000_000_000, duration_days=30)
    direct_vm.value = 0
    pool_after_loan = c.get_pool_stats()["total_liquidity_atto"]
    did = c.submit_dispute(loan_id=1, evidence_url="https://x.com/dave/status/1ispute", reason="borrower claims repaid")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "dispute evidence borrower met terms", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verdict": "borrower_win", "reason": "evidence supports borrower"}))
    verdict = c.resolve_dispute(did)
    assert verdict == "borrower_win"
    assert c.get_loan(1)["status"] == "repaid"
    pool_after = c.get_pool_stats()["total_liquidity_atto"]
    assert pool_after == pool_after_loan
    assert c.get_platform_fees()["fees_atto"] == 0

def test_expiry_absolute_and_liquidation_after_expiry(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    vid = c.link_identity(handle="alice", platform="x", proof_url="https://x.com/alice/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 80, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
    c.assess_reputation(vid)
    direct_vm.value = 700_000_000_000_000_000
    c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=700_000_000_000_000_000, duration_days=30)
    direct_vm.value = 0
    loan = c.get_loan(1)
    expiry = int(loan["expiry_at"])
    assert expiry > 86400
    c.admin_set_test_timestamp(expiry + 1)
    pool_before = c.get_pool_stats()["total_liquidity_atto"]
    c.liquidate_loan(1)
    assert c.get_loan(1)["status"] == "liquidated"
    assert c.get_pool_stats()["total_liquidity_atto"] == pool_before + 700_000_000_000_000_000
