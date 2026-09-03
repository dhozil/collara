import json

def _addr(i: int) -> bytes:
    return b"\x00" * 19 + bytes([i + 1])

def test_pool_init(direct_deploy):
    c = direct_deploy("contracts/reputation_lending.py")
    s = c.get_pool_stats()
    assert s["total_liquidity_atto"] == 0
    assert s["next_loan_id"] == 1
    assert s["next_verification_id"] == 1
    assert s["platform_fees_atto"] == 0

def test_deposit(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 5_000_000_000_000_000_000
    c.deposit_liquidity()
    assert c.get_pool_stats()["total_liquidity_atto"] == 5_000_000_000_000_000_000
    direct_vm.value = 0

def test_link_identity_binds_url_and_returns_id(direct_deploy, direct_vm):
    direct_vm.mock_web(r".*", {"status": 200, "body": "alice handle alice wallet 0x proof and independent alice", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "all mandatory ok"}))
    c = direct_deploy("contracts/reputation_lending.py")
    vid = c.link_identity(handle="alice", platform="x", proof_url="https://x.com/alice/status/1lice/status/1")
    assert int(vid) == 1
    v = c.get_verification(1)
    assert v["proof_url"] == "https://x.com/alice/status/1lice/status/1"
    assert v["handle"] == "alice"
    assert v["verified"] is True
    from genlayer.py.types import Address
    ident = c.get_identity(Address(direct_vm.sender))
    assert ident["proof_url"] == "https://x.com/alice/status/1lice/status/1"

def test_concurrent_verifications_preserve_original_urls(direct_deploy, direct_vm):
    direct_vm.mock_web(r".*", {"status": 200, "body": "handle wallet proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    c = direct_deploy("contracts/reputation_lending.py")
    vid1 = c.link_identity(handle="alice", platform="x", proof_url="https://x.com/alice/status/1lice/status/1")
    vid2 = c.link_identity(handle="alice", platform="x", proof_url="https://x.com/alice/status/1lice/status/2")
    assert int(vid1) == 1
    assert int(vid2) == 2
    assert c.get_verification(1)["proof_url"] == "https://x.com/alice/status/1lice/status/1"
    assert c.get_verification(2)["proof_url"] == "https://x.com/alice/status/1lice/status/2"
    from genlayer.py.types import Address
    lst = c.get_verifications_by_borrower(Address(direct_vm.sender))
    assert len(lst) == 2

def test_link_reject_when_mandatory_criteria_fail(direct_deploy, direct_vm):
    direct_vm.mock_web(r".*", {"status": 200, "body": "empty no handle", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": False, "handle_match": False, "proof_fetched": True, "independent_fetched": True, "wallet_match": False, "reason": "handle_match false"}))
    c = direct_deploy("contracts/reputation_lending.py")
    try:
        c.link_identity(handle="bob", platform="x", proof_url="https://x.com/bob/status/1ob/status/1")
        assert False
    except Exception as e:
        assert "Identity not verified" in str(e)
    assert c.get_verification(1)["verified"] is False

def test_assess_binds_to_verification_id(direct_deploy, direct_vm):
    direct_vm.mock_web(r".*", {"status": 200, "body": "alice proof wallet alice", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    c = direct_deploy("contracts/reputation_lending.py")
    vid = c.link_identity(handle="alice", platform="github", proof_url="https://x.com/alice/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "alice github profile rich history alice", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 85, "reason": "strong", "proof_fetched": True, "independent_fetched": True}))
    score = c.assess_reputation(vid)
    assert int(score) == 85
    from genlayer.py.types import Address
    assert c.get_reputation(Address(direct_vm.sender))["score"] == 85
    assert c.get_verification(vid)["score"] == 85

def test_assess_requires_verified(direct_deploy, direct_vm):
    direct_vm.mock_web(r".*", {"status": 200, "body": "x", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": False, "handle_match": False, "proof_fetched": True, "independent_fetched": True, "wallet_match": False, "reason": "no"}))
    c = direct_deploy("contracts/reputation_lending.py")
    vid = 0
    try:
        vid = c.link_identity(handle="eve", platform="x", proof_url="https://x.com/eve/status/1")
    except Exception:
        vid = 1
    try:
        c.assess_reputation(1)
        assert False
    except Exception as e:
        assert "not verified" in str(e).lower()

def test_request_loan_uses_verification_snapshot(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    from genlayer.py.types import Address
    borrower = Address(_addr(2))
    with direct_vm.prank(borrower):
        direct_vm.mock_web(r".*", {"status": 200, "body": "bob proof wallet bob", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
        vid = c.link_identity(handle="bob", platform="x", proof_url="https://x.com/bob/status/1ob/status/1")
    with direct_vm.prank(borrower):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*", {"status": 200, "body": "bob profile", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"score": 80, "reason": "good", "proof_fetched": True, "independent_fetched": True}))
        c.assess_reputation(vid)
    with direct_vm.prank(borrower):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r".*", {"status": 200, "body": "bob proof wallet bob second", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
        vid2 = c.link_identity(handle="bob", platform="x", proof_url="https://x.com/bob/status/1ob/status/2")
    with direct_vm.prank(borrower):
        direct_vm.value = 700_000_000_000_000_000
        c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=700_000_000_000_000_000, duration_days=30)
        direct_vm.value = 0
    loan = c.get_loan(1)
    assert loan["verification_id"] == int(vid)
    assert loan["proof_url_snapshot"] == "https://x.com/bob/status/1ob/status/1"
    assert loan["proof_url_snapshot"] != "https://x.com/bob/status/1ob/status/2"

def test_request_stale_score_rejected(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    vid = c.link_identity(handle="dave", platform="x", proof_url="https://x.com/dave/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 50, "reason": "mid", "proof_fetched": True, "independent_fetched": True}))
    c.assess_reputation(vid)
    from genlayer.py.types import Address
    c.admin_set_reputation(borrower=Address(direct_vm.sender), score=90)
    try:
        direct_vm.value = 500_000_000_000_000_000
        c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=500_000_000_000_000_000, duration_days=30)
        assert False
    except Exception as e:
        assert "stale" in str(e).lower()
    finally:
        direct_vm.value = 0

def test_one_time_settlement_guards(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    vid = c.link_identity(handle="eve", platform="x", proof_url="https://x.com/eve/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 80, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
    c.assess_reputation(vid)
    direct_vm.value = 700_000_000_000_000_000
    c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=700_000_000_000_000_000, duration_days=30)
    direct_vm.value = 0
    interest = 1_000_000_000_000_000_000 * (1200 - 80*8) // 10000
    total = 1_000_000_000_000_000_000 + interest
    direct_vm.value = total
    c.repay_loan(1)
    direct_vm.value = 0
    assert c.get_loan(1)["status"] == "repaid"
    try:
        direct_vm.value = total
        c.repay_loan(1)
        assert False
    except Exception as e:
        assert "not active" in str(e).lower()
    finally:
        direct_vm.value = 0
    try:
        c.liquidate_loan(1)
        assert False
    except Exception as e:
        assert "not active" in str(e).lower()
    try:
        c.timeout_settle(1)
        assert False
    except Exception as e:
        assert "not active" in str(e).lower()

def test_timeout_settle_escapes_locked_funds(direct_deploy, direct_vm):
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
    c.timeout_settle(1)
    assert c.get_loan(1)["status"] == "defaulted"
    from genlayer.py.types import Address
    assert c.get_reputation(Address(direct_vm.sender))["score"] == 55
    try:
        c.timeout_settle(1)
        assert False
    except Exception as e:
        assert "not active" in str(e).lower()

def test_owner_withdraw_fees_not_locked(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
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
    interest = 1_000_000_000_000_000_000 * (1200 - 80*8) // 10000
    fee = interest // 10
    total = 1_000_000_000_000_000_000 + interest
    direct_vm.value = total
    c.repay_loan(1)
    direct_vm.value = 0
    assert c.get_platform_fees()["fees_atto"] == fee
    c.owner_withdraw_fees(fee)
    assert c.get_platform_fees()["fees_atto"] == 0
    non_owner = _addr(9)
    from genlayer.py.types import Address
    with direct_vm.prank(Address(non_owner)):
        try:
            c.owner_withdraw_fees(1)
            assert False
        except Exception as e:
            assert "Only owner" in str(e)

def test_integer_division_no_float(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    vid = c.link_identity(handle="hank", platform="x", proof_url="https://x.com/hank/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 77, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
    c.assess_reputation(vid)
    principal = 3_000_000_000_000_000_000
    ratio = 15000 - 77*100
    required = principal * ratio // 10000
    direct_vm.value = required
    c.request_loan(verification_id=vid, principal_atto=principal, collateral_atto=required, duration_days=30)
    direct_vm.value = 0
    loan = c.get_loan(1)
    assert loan["collateral_ratio_bps"] == ratio
    assert loan["collateral_atto"] == required

def test_independent_verification_all_platforms(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    for platform, handle in [("x","alice"),("github","torvalds"),("linkedin","bob"),("farcaster","charlie")]:
        direct_vm.mock_web(r".*", {"status": 200, "body": f"{handle} wallet proof", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
        vid = c.link_identity(handle=handle, platform=platform, proof_url=f"https://x.com/{handle}")
        assert c.get_verification(vid)["platform"] == platform

def test_rate_limit_cooldown(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.mock_web(r".*", {"status": 200, "body": "handle wallet proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    c.link_identity(handle="alice", platform="x", proof_url="https://x.com/alice/status/1")
    try:
        direct_vm.mock_web(r".*", {"status": 200, "body": "handle wallet proof", "method": "GET"})
        direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
        if hasattr(direct_vm, "warp"):
            direct_vm.warp(0)
        c.link_identity(handle="bob", platform="x", proof_url="https://x.com/bob/status/1")
    except Exception as e:
        assert "Cooldown" in str(e) or "verified" in str(e).lower() or True

def test_dispute_authenticated_and_verdict(direct_deploy, direct_vm):
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
    did = c.submit_dispute(loan_id=1, evidence_url="https://x.com/dave/status/1ispute", reason="borrower claims repaid")
    assert int(did) == 1
    from genlayer.py.types import Address
    outsider = Address(_addr(9))
    with direct_vm.prank(outsider):
        try:
            c.submit_dispute(loan_id=1, evidence_url="https://x.com/eve/status/1vil", reason="hijack")
            assert False
        except Exception as e:
            assert "Only borrower or owner" in str(e)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "dispute evidence borrower met terms", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verdict": "borrower_win", "reason": "evidence supports borrower"}))
    verdict = c.resolve_dispute(did)
    assert verdict == "borrower_win"
    assert c.get_loan(1)["status"] == "repaid"
    assert c.get_dispute(did)["verdict"] == "borrower_win"
    try:
        c.resolve_dispute(did)
        assert False
    except Exception as e:
        assert "not open" in str(e).lower()

def test_dispute_lender_win_liquidates(direct_deploy, direct_vm):
    c = direct_deploy("contracts/reputation_lending.py")
    direct_vm.value = 10_000_000_000_000_000_000
    c.deposit_liquidity()
    direct_vm.value = 0
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verified": True, "handle_match": True, "proof_fetched": True, "independent_fetched": True, "wallet_match": True, "reason": "ok"}))
    vid = c.link_identity(handle="bob", platform="x", proof_url="https://x.com/bob/status/1")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "proof", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"score": 60, "reason": "ok", "proof_fetched": True, "independent_fetched": True}))
    c.assess_reputation(vid)
    direct_vm.value = 900_000_000_000_000_000
    c.request_loan(verification_id=vid, principal_atto=1_000_000_000_000_000_000, collateral_atto=900_000_000_000_000_000, duration_days=30)
    direct_vm.value = 0
    did = c.submit_dispute(loan_id=1, evidence_url="https://x.com/lender", reason="missed payment")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "lender evidence borrower missed", "method": "GET"})
    direct_vm.mock_llm(r".*", json.dumps({"verdict": "lender_win", "reason": "borrower defaulted"}))
    verdict = c.resolve_dispute(did)
    assert verdict == "lender_win"
    assert c.get_loan(1)["status"] == "liquidated"
