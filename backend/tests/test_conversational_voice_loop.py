"""
Phase 3E Tests: Full Conversational Voice Loop + TTS Refinement
Validates end-to-end integration:
1. Sarvam STT transcription handling
2. Sarvam Bulbul:v3 TTS server proxy, language resolution & graceful browser fallback
3. Deterministic option matching & normalization
4. Groq natural-language interpretation (clarification & contradiction handling)
5. Interview state advancement and profile normalization
6. Deterministic NSQF Recommendation Engine 2.0 transition
7. Groq recommendation natural-language explanation grounded in deterministic match reasons
8. Security, authorization, and capability token isolation
"""

import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4
import httpx
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.db.supabase import get_supabase_client
from app.services.tts_service import (
    resolve_sarvam_tts_language,
    clean_text_for_speech,
    synthesize_speech,
)
from app.schemas.voice import SynthesisRequest, SynthesisResponse
from app.schemas.adaptive_interview import (
    StructuredBeneficiaryProfile,
)
from app.schemas.nsqf_recommendation import (
    NSQFRecommendationResponse,
    NSQFRecommendationItem,
)
from app.services.groq_service import explain_nsqf_recommendations_with_groq
from tests.test_adaptive_interview import FakeSupabase, seed_test_beneficiary


@pytest.fixture
def test_client_fixture():
    fake = FakeSupabase()
    app.dependency_overrides[get_supabase_client] = lambda: fake
    with TestClient(app) as client:
        yield client, fake
    app.dependency_overrides.clear()


# ============================================================================
# 1. TTS SERVICE & LANGUAGE RESOLUTION TESTS
# ============================================================================

def test_tts_language_resolution():
    """Verify supported Indic languages resolve to BCP-47 codes and others trigger fallback."""
    assert resolve_sarvam_tts_language("hi") == "hi-IN"
    assert resolve_sarvam_tts_language("bn") == "bn-IN"
    assert resolve_sarvam_tts_language("ta") == "ta-IN"
    assert resolve_sarvam_tts_language("te") == "te-IN"
    assert resolve_sarvam_tts_language("mr") == "mr-IN"
    assert resolve_sarvam_tts_language("gu") == "gu-IN"
    assert resolve_sarvam_tts_language("kn") == "kn-IN"
    assert resolve_sarvam_tts_language("ml") == "ml-IN"
    assert resolve_sarvam_tts_language("pa") == "pa-IN"
    assert resolve_sarvam_tts_language("or") == "od-IN"
    assert resolve_sarvam_tts_language("en") == "en-IN"

    # Unsupported in Bulbul:v3 -> None (triggers browser Web Speech fallback)
    assert resolve_sarvam_tts_language("ur") is None
    assert resolve_sarvam_tts_language("as") is None
    assert resolve_sarvam_tts_language("ks") is None
    assert resolve_sarvam_tts_language("unknown") is None


def test_clean_text_for_tts():
    """Verify markdown symbols, backticks, asterisks are stripped for clean audio output."""
    raw = "**नमस्ते!** `सोलर` *इलेक्ट्रीशियन* [कोर्स] #1"
    cleaned = clean_text_for_speech(raw)
    assert "*" not in cleaned
    assert "`" not in cleaned
    assert "#" not in cleaned
    assert "[" not in cleaned
    assert "]" not in cleaned
    assert "नमस्ते" in cleaned
    assert "सोलर" in cleaned


def test_tts_synthesize_unsupported_language_returns_fallback():
    """When an unsupported language is requested, return fallback_needed=True without error."""
    result = asyncio.run(
        synthesize_speech(
            SynthesisRequest(text="অসমীয়া ভাষা", language="as")
        )
    )
    assert result.fallback_needed is True
    assert result.audio_base64 is None
    assert result.language_code == "as"


def test_tts_synthesize_unconfigured_key_returns_fallback(monkeypatch):
    """When SARVAM_API_KEY is not configured, gracefully return fallback_needed=True."""
    monkeypatch.setattr(settings, "SARVAM_API_KEY", "")
    result = asyncio.run(
        synthesize_speech(
            SynthesisRequest(text="नमस्ते", language="hi")
        )
    )
    assert result.fallback_needed is True
    assert result.audio_base64 is None


def test_tts_synthesize_success_mock(monkeypatch):
    """When Sarvam TTS API succeeds, return valid audio_base64."""
    monkeypatch.setattr(settings, "SARVAM_API_KEY", "mock_sarvam_key")

    mock_resp = httpx.Response(
        200,
        json={"audios": ["dGVzdF9hdWRpb19iYXNlNjQ="]},
        request=httpx.Request("POST", settings.SARVAM_TTS_URL),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = asyncio.run(
            synthesize_speech(
                SynthesisRequest(
                    text="नमस्ते, आपकी कक्षा 10वीं पास दर्ज हो गई है।",
                    language="hi",
                    speaker="priya",
                )
            )
        )

    assert result.fallback_needed is False
    assert result.audio_base64 == "dGVzdF9hdWRpb19iYXNlNjQ="
    assert result.content_type == "audio/wav"
    assert result.language_code == "hi-IN"


def test_voice_synthesize_endpoint_success(test_client_fixture):
    """Test POST /api/voice/synthesize endpoint with mock service."""
    client, _ = test_client_fixture

    async def mock_synth(*args, **kwargs):
        return SynthesisResponse(
            audio_base64="bW9ja19hdWRpb19kYXRh",
            content_type="audio/wav",
            language_code="hi-IN",
            fallback_needed=False,
            success=True,
        )

    with patch("app.api.routes.voice.synthesize_speech", side_effect=mock_synth):
        response = client.post(
            "/api/voice/synthesize",
            json={"text": "सोलर पैनल कोर्स", "language": "hi", "speaker": "priya"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["audio_base64"] == "bW9ja19hdWRpb19kYXRh"
        assert data["fallback_needed"] is False


def test_voice_synthesize_empty_text_returns_fallback(test_client_fixture):
    """Empty or whitespace-only text safely returns fallback without crashing."""
    client, _ = test_client_fixture
    response = client.post(
        "/api/voice/synthesize",
        json={"text": "   ", "language": "hi"},
    )
    assert response.status_code == 200
    assert response.json()["fallback_needed"] is True
    assert not response.json().get("audio_base64")


# ============================================================================
# 2. GROQ RECOMMENDATION EXPLANATION TESTS
# ============================================================================

def test_explain_recommendations_offline_fallback(monkeypatch):
    """When Groq is unconfigured or unavailable, offline multilingual template provides clear explanation."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    from app.schemas.nsqf_recommendation import NSQFEligibilityEvaluation, NSQFEligibilityStatus
    b_id = uuid4()
    int_id = uuid4()
    dummy_profile = StructuredBeneficiaryProfile(
        beneficiary_id=b_id,
        interview_id=int_id,
        name="राम",
        preferred_language="hi",
    )
    from datetime import datetime
    elig = NSQFEligibilityEvaluation(
        status=NSQFEligibilityStatus.ELIGIBLE,
        eligible=True,
    )
    recs_resp = NSQFRecommendationResponse(
        beneficiary_id=b_id,
        interview_id=int_id,
        status="eligible",
        generated_at=datetime.utcnow(),
        total_evaluated=100,
        total_recommended=1,
        message="Recommendations evaluated",
        recommendations=[
            NSQFRecommendationItem(
                q_code="AGR/Q001",
                title="Solar Pump Technician",
                sector_id="green_jobs",
                sector_name="Green Jobs",
                nsqf_level=4.0,
                notional_hours_range="201-400",
                is_pwd=False,
                pwd_categories=[],
                rank=1,
                score=88,
                eligibility=elig,
                match_reasons=["Direct Green Jobs sector alignment", "Meets 10th pass qualification requirement"],
            )
        ],
    )

    # Test Hindi template
    resp_hi = asyncio.run(
        explain_nsqf_recommendations_with_groq(
            beneficiary_id=b_id,
            interview_id=int_id,
            recommendations_response=recs_resp,
            profile=dummy_profile,
            lang="hi",
            top_n=3,
        )
    )
    assert resp_hi.overall_explanation != ""
    assert "Solar Pump Technician" in resp_hi.overall_explanation
    assert len(resp_hi.items) == 1
    assert resp_hi.items[0].q_code == "AGR/Q001"

    # Test Bengali template
    resp_bn = asyncio.run(
        explain_nsqf_recommendations_with_groq(
            beneficiary_id=b_id,
            interview_id=int_id,
            recommendations_response=recs_resp,
            profile=dummy_profile,
            lang="bn",
            top_n=3,
        )
    )
    assert "Solar Pump Technician" in resp_bn.overall_explanation
    assert len(resp_bn.items) == 1


def test_explain_recommendations_with_groq_mock(monkeypatch):
    """Verify Groq conversational explanation returns faithful text without modifying courses."""
    from datetime import datetime
    from app.schemas.nsqf_recommendation import NSQFEligibilityEvaluation, NSQFEligibilityStatus
    monkeypatch.setattr(settings, "GROQ_API_KEY", "mock_groq_key")
    b_id = uuid4()
    int_id = uuid4()
    dummy_profile = StructuredBeneficiaryProfile(
        beneficiary_id=b_id,
        interview_id=int_id,
        name="अनिल",
        preferred_language="hi",
    )
    elig = NSQFEligibilityEvaluation(
        status=NSQFEligibilityStatus.ELIGIBLE,
        eligible=True,
    )
    recs_resp = NSQFRecommendationResponse(
        beneficiary_id=b_id,
        interview_id=int_id,
        status="eligible",
        generated_at=datetime.utcnow(),
        total_evaluated=50,
        total_recommended=1,
        message="Recommendations evaluated",
        recommendations=[
            NSQFRecommendationItem(
                q_code="CON/Q01",
                title="Mason General",
                sector_id="construction",
                sector_name="Construction",
                nsqf_level=3.0,
                notional_hours_range="201-400",
                is_pwd=False,
                pwd_categories=[],
                rank=1,
                score=90,
                eligibility=elig,
                match_reasons=["Direct construction sector match"],
            )
        ],
    )

    mock_response = {
        "choices": [
            {
                "message": {
                    "content": '{"overall_explanation": "आपके कौशल और अनुभव के आधार पर यह कोर्स उपयुक्त है।", "items": [{"q_code": "CON/Q01", "spoken_summary": "यह कोर्स निर्माण क्षेत्र में उत्कृष्ट अवसर प्रदान करता है।"}]}'
                }
            }
        ]
    }

    with patch("app.services.groq_service.call_groq_chat_completion", new_callable=AsyncMock, return_value=mock_response):
        result = asyncio.run(
            explain_nsqf_recommendations_with_groq(
                beneficiary_id=b_id,
                interview_id=int_id,
                recommendations_response=recs_resp,
                profile=dummy_profile,
                lang="hi",
                top_n=3,
            )
        )

    assert result is not None
    assert len(result.items) == 1
    assert result.items[0].q_code == "CON/Q01"
    assert "निर्माण" in result.items[0].spoken_summary


# ============================================================================
# 3. ADAPTIVE INTERVIEW ENDPOINT & EXPLANATION INTEGRATION TESTS
# ============================================================================

def test_explain_recommendations_endpoint_cross_user_forbidden(test_client_fixture):
    """Calling explain-recommendations with another beneficiary's token must be rejected with 403."""
    client, fake = test_client_fixture
    b_id1, token1 = seed_test_beneficiary(fake)
    _, token2 = seed_test_beneficiary(fake)

    # Start an interview for Beneficiary 1
    start_res = client.post(
        "/api/adaptive-interview/sessions",
        json={"beneficiary_id": b_id1, "language": "hi"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    interview_id = start_res.json()["interview_id"]

    # Beneficiary 2 attempts to explain Beneficiary 1's interview -> 403 Forbidden
    response = client.post(
        f"/api/adaptive-interview/{interview_id}/explain-recommendations",
        headers={"Authorization": f"Bearer {token2}"},
        json={"language": "hi", "top_n": 3},
    )
    assert response.status_code == 403


def test_explain_recommendations_endpoint_invalid_token_unauthorized(test_client_fixture):
    """Calling explain-recommendations with an invalid token returns 401."""
    client, fake = test_client_fixture
    b_id, token = seed_test_beneficiary(fake)

    start_res = client.post(
        "/api/adaptive-interview/sessions",
        json={"beneficiary_id": b_id, "language": "hi"},
        headers={"Authorization": f"Bearer {token}"},
    )
    interview_id = start_res.json()["interview_id"]

    response = client.post(
        f"/api/adaptive-interview/{interview_id}/explain-recommendations",
        headers={"Authorization": "Bearer invalid_malformed_token"},
        json={"language": "hi", "top_n": 3},
    )
    assert response.status_code == 401


def test_explain_recommendations_endpoint_success(test_client_fixture):
    """When an authorized beneficiary requests an explanation, returns overall explanation."""
    client, fake = test_client_fixture
    b_id, token = seed_test_beneficiary(fake)

    start_res = client.post(
        "/api/adaptive-interview/sessions",
        json={"beneficiary_id": b_id, "language": "hi"},
        headers={"Authorization": f"Bearer {token}"},
    )
    interview_id = start_res.json()["interview_id"]

    response = client.post(
        f"/api/adaptive-interview/{interview_id}/explain-recommendations",
        headers={"Authorization": f"Bearer {token}"},
        json={"language": "hi", "top_n": 3},
    )
    assert response.status_code == 200
    data = response.json()
    assert "overall_explanation" in data
    assert data["language"] == "hi"


# ============================================================================
# 4. DETERMINISTIC OPTION MATCHING & VOICE CLARIFICATION TESTS
# ============================================================================

def test_interpret_voice_exact_deterministic_normalization(test_client_fixture):
    """When the citizen says a canonical education token like '10th', it updates state without ambiguity."""
    client, fake = test_client_fixture
    b_id, token = seed_test_beneficiary(fake)

    start_res = client.post(
        "/api/adaptive-interview/sessions",
        json={"beneficiary_id": b_id, "language": "en"},
        headers={"Authorization": f"Bearer {token}"},
    )
    interview_id = start_res.json()["interview_id"]

    response = client.post(
        f"/api/adaptive-interview/{interview_id}/interpret",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "transcript": "10th",
            "language": "en",
            "question_id": "edu_highest_level",
            "apply_to_profile": True,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["clarification_needed"] is False
    assert len(data["interpretation"]["contradictions"]) == 0
    assert data["interpretation"]["needs_clarification"] is False
    assert data["updated_state"]["profile_summary"]["education"] == "10th"


def test_interpret_voice_ambiguity_returns_clarification(test_client_fixture):
    """When the beneficiary gives vague natural speech, Groq returns clarification rather than guessing."""
    client, fake = test_client_fixture
    b_id, token = seed_test_beneficiary(fake)

    start_res = client.post(
        "/api/adaptive-interview/sessions",
        json={"beneficiary_id": b_id, "language": "hi"},
        headers={"Authorization": f"Bearer {token}"},
    )
    interview_id = start_res.json()["interview_id"]

    mock_ambiguous = {
        "choices": [
            {
                "message": {
                    "content": '{"needs_clarification": true, "clarification_question": "कृपया बताएं कि आपको कितने वर्षों का अनुभव है?"}'
                }
            }
        ]
    }

    with patch("app.services.groq_service.call_groq_chat_completion", new_callable=AsyncMock, return_value=mock_ambiguous):
        response = client.post(
            f"/api/adaptive-interview/{interview_id}/interpret",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "transcript": "मैंने थोड़ा बहुत काम किया है",
                "language": "hi",
                "question_id": "exp_years",
                "apply_to_profile": True,
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["clarification_needed"] is True
    assert data["clarification_question"] is not None
    assert len(data["clarification_question"]) > 5
