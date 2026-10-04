"""
Utthan Backend - Groq Conversational Understanding & Structured Profile Extraction Service.
Phase 3C: Assistive Multilingual Transcript Interpretation, Contradiction Detection, and Clarification.

Authority Hierarchy Enforced:
1. Authoritative: NSQF/NQR Catalog DB, Deterministic Eligibility/Rules, Adaptive State Machine, Structured Profile.
2. Assistive: Groq LLM (Transcript understanding, field extraction, ambiguity detection, clarification generation).
3. Zero Hallucination: Groq NEVER assigns NSQF levels, invents courses/codes, or makes official eligibility decisions.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import httpx
from supabase import Client

from app.core.config import settings
from app.schemas.adaptive_interview import (
    AdaptiveAnswerSubmit,
    AdaptiveInterviewState,
    AdaptiveQuestion,
    InputMethod,
    InterviewStage,
    QuestionInputType,
    QuestionOption,
    StructuredBeneficiaryProfile,
)
from app.schemas.beneficiary import LanguageCode
from app.schemas.groq_extraction import (
    ContradictionItem,
    ExplainRecommendationsResponse,
    ExtractedProfileFields,
    InterpretationResult,
    InterpretTranscriptResponse,
    RecommendationExplanationItem,
)
from app.schemas.nsqf_recommendation import NSQFRecommendationResponse

from app.services.adaptive_interview_service import (
    _load_beneficiary_row,
    _load_interview_row,
    _now,
    calculate_completeness,
    determine_current_stage,
    generate_adaptive_question,
    get_adaptive_interview_state,
    get_or_initialize_profile,
    json_safe,
    normalize_education,
    normalize_experience_years,
    normalize_notional_hours,
    normalize_pwd,
    normalize_vocational_training,
    submit_answer_to_interview,
)
from app.services.nsqf_service import list_sectors

logger = logging.getLogger("utthan.groq_service")

# Prompt enforcing non-negotiable architectural boundaries
GROQ_SYSTEM_PROMPT = """You are the conversational understanding layer for Utthan (उत्थान), an AI voice platform empowering Indian citizens for NSQF-aligned skilling under PM-AJAY.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. You are an interpretation and extraction assistant only. You DO NOT determine official eligibility.
2. You DO NOT recommend courses. You DO NOT choose qualifications.
3. You DO NOT assign NSQF levels to the beneficiary.
4. You DO NOT invent or fabricate qualifications, course codes, or sectors.
5. You DO NOT invent government scheme rules.
6. If the citizen's response is ambiguous, contradictory, or incomplete, you MUST set needs_clarification=true.
7. If information is missing, do not guess. Return null for absent fields.
8. Understand multilingual responses (Hindi, Bengali, English, Hinglish, Banglish).
9. Clarification questions must be short, friendly, spoken-language questions in the citizen's active language.

ALLOWED CANONICAL VALUES:
- Education: none, no_formal, literate_read_write, 5th, 6th, 7th, 8th, 9th, 10th, 11th, 12th, 1st_year_diploma, ug_diploma, diploma, ug, graduate, post_graduate, phd, previous_nsqf, iti_instructor_cits
- Vocational Training: none, iti, cts_ntc, 2_year_ntc, 1_year_cts, cits, ats, nac, dst, flexi_mou, ntc_cits, ntc_nac_cits, ntc_nac, ntc, equivalent
- Notional Hours: 1–200, 201–400, 401–600, 601–800, 801–1000, 1001–1200, 1201–2400, Above 2401
- PwD Categories: VI, SHI, LD, ID

OUTPUT SPECIFICATION:
Respond ONLY with a valid JSON object matching this structure:
{
  "extracted_fields": {
    "name": string or null,
    "education": string or null,
    "vocational_training_has": boolean or null,
    "vocational_training_type": string or null,
    "experience_years": float or null,
    "experience_domain": string or null,
    "interested_sector_slug": string or null,
    "skills": [string],
    "tools_familiarity": [string],
    "notional_hours_range": string or null,
    "pwd_status": boolean or null,
    "pwd_categories": [string],
    "mobility_preference": string or null,
    "primary_goal": string or null
  },
  "confidence": {
    "field_name": float between 0.0 and 1.0
  },
  "unresolved_fields": [string],
  "contradictions": [
    {
      "field": string,
      "previous_value": any,
      "new_value": any,
      "explanation": string
    }
  ],
  "needs_clarification": boolean,
  "clarification_question": string or null,
  "reasoning_summary": string or null
}
"""


def _sanitize_llm_json(raw_text: str) -> str:
    """Removes thinking tags, markdown fences, and leading/trailing noise."""
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", raw_text, flags=re.IGNORECASE)
    cleaned = re.sub(r"```json\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"```\s*", "", cleaned)
    return cleaned.strip()


def detect_profile_contradictions(
    extracted: ExtractedProfileFields,
    current_profile: StructuredBeneficiaryProfile,
    lang: str = "hi",
) -> Tuple[List[ContradictionItem], Optional[str]]:
    """
    Compares newly extracted values against established facts in the structured profile.
    If a significant contradiction is found, flags it and generates a localized clarification question.
    """
    contradictions: List[ContradictionItem] = []
    clarification_q: Optional[str] = None

    # 1. Experience Years Contradiction (e.g. 2 years vs 6 years)
    if (
        extracted.experience_years is not None
        and current_profile.work_experience_label is not None
        and current_profile.work_experience_years > 0.0
    ):
        diff = abs(extracted.experience_years - current_profile.work_experience_years)
        if diff >= 1.0 and extracted.experience_years != current_profile.work_experience_years:
            prev_val = current_profile.work_experience_years
            new_val = extracted.experience_years
            contradictions.append(ContradictionItem(
                field="experience_years",
                previous_value=prev_val,
                new_value=new_val,
                explanation=f"Previously reported {prev_val} years, now stated {new_val} years."
            ))
            clarification_q = {
                "hi": f"आपने पहले {prev_val} वर्ष और अब {new_val} वर्ष का अनुभव बताया है। आपका सही अनुभव कितना है?",
                "bn": f"আপনি আগে {prev_val} বছর এবং এখন {new_val} বছরের কথা বলেছেন। আপনার সঠিক কাজের অভিজ্ঞতা কত বছরের?",
                "en": f"You previously mentioned {prev_val} years and now mentioned {new_val} years. Which experience duration is correct?",
            }.get(lang, f"You mentioned both {prev_val} and {new_val} years. Which duration is correct?")

    # 2. Education Contradiction (e.g. 8th vs graduate)
    if (
        extracted.education is not None
        and current_profile.education_label is not None
        and current_profile.education not in (None, "none", "no_formal")
    ):
        canon_new = normalize_education(extracted.education)
        if canon_new != current_profile.education:
            prev_edu = current_profile.education_label
            new_edu = extracted.education
            contradictions.append(ContradictionItem(
                field="education",
                previous_value=current_profile.education,
                new_value=canon_new,
                explanation=f"Previously recorded as {prev_edu}, now stated {new_edu}."
            ))
            if not clarification_q:
                clarification_q = {
                    "hi": f"आपकी शिक्षा पहले '{prev_edu}' दर्ज थी, अब आपने '{new_edu}' बताया है। कृपया अपनी सही योग्यता बताएं।",
                    "bn": f"আপনার শিক্ষা আগে '{prev_edu}' ছিল, এখন '{new_edu}' বলেছেন। অনুগ্রহ করে সঠিক যোগ্যতা জানান।",
                    "en": f"Your schooling was previously recorded as '{prev_edu}' and now stated as '{new_edu}'. Please confirm your qualification.",
                }.get(lang, "Please clarify your highest level of education.")

    # 3. Vocational Training Contradiction (e.g. None vs ITI)
    if (
        extracted.vocational_training_has is not None
        and current_profile.vocational_training_type is not None
    ):
        prev_has = current_profile.vocational_training
        new_has = extracted.vocational_training_has
        if prev_has != new_has and current_profile.vocational_training_type != "none":
            contradictions.append(ContradictionItem(
                field="vocational_training",
                previous_value=current_profile.vocational_training_type,
                new_value=extracted.vocational_training_type or "none",
                explanation="Contradiction in prior vocational training completion."
            ))

    return contradictions, clarification_q


def deterministic_pre_match(
    transcript: str,
    options: List[QuestionOption],
) -> Optional[QuestionOption]:
    """
    Fast, deterministic option matcher.
    If a transcript exactly or clearly matches an existing choice option,
    we bypass unnecessary Groq calls for speed and cost efficiency.
    """
    clean_t = transcript.strip().lower()
    for opt in options:
        opt_val = opt.value.lower()
        opt_lbl = opt.label.lower()
        if clean_t == opt_val or clean_t == opt_lbl:
            return opt
        # Exact word token match
        if opt_lbl in clean_t or (len(opt_val) > 2 and opt_val in clean_t.split()):
            return opt
    return None


def validate_and_normalize_extracted_fields(
    raw_fields: ExtractedProfileFields,
    active_sectors: List[str],
) -> Tuple[ExtractedProfileFields, List[str]]:
    """
    Strict validation layer (Section 9):
    Normalizes extracted raw values using Phase 3B canonical normalizers.
    Rejects or flags any ungrounded / unsupported values.
    """
    normalized = ExtractedProfileFields()
    unresolved: List[str] = []

    # 1. Education
    if raw_fields.education:
        canon_edu = normalize_education(raw_fields.education)
        # Check against canonical 20 education levels
        valid_edu = {
            "none", "no_formal", "literate_read_write", "5th", "6th", "7th", "8th", "9th",
            "10th", "11th", "12th", "1st_year_diploma", "ug_diploma", "diploma", "ug",
            "graduate", "post_graduate", "phd", "previous_nsqf", "iti_instructor_cits"
        }
        if canon_edu in valid_edu:
            normalized.education = canon_edu
        else:
            unresolved.append("education")

    # 2. Vocational Training
    if raw_fields.vocational_training_type or raw_fields.vocational_training_has is not None:
        raw_val = raw_fields.vocational_training_type or ("iti" if raw_fields.vocational_training_has else "none")
        is_trained, canon_voc = normalize_vocational_training(raw_val)
        normalized.vocational_training_has = is_trained
        normalized.vocational_training_type = canon_voc

    # 3. Work Experience
    if raw_fields.experience_years is not None:
        normalized.experience_years = normalize_experience_years(raw_fields.experience_years)
    normalized.experience_domain = raw_fields.experience_domain

    # 4. Sector
    if raw_fields.interested_sector_slug:
        candidate_slug = raw_fields.interested_sector_slug.strip().lower()
        # Direct match with authoritative 44 sectors
        if candidate_slug in active_sectors:
            normalized.interested_sector_slug = candidate_slug
        else:
            # Common semantic trade alias to 44 sectors
            alias_map = {
                "farming": "agriculture",
                "kheti": "agriculture",
                "krishi": "agriculture",
                "electrical": "electronics-hw",
                "wiring": "electronics-hw",
                "electrician": "electronics-hw",
                "computer": "it-ites",
                "coding": "it-ites",
                "data_entry": "it-ites",
                "hospital": "healthcare",
                "nursing": "healthcare",
                "medical": "healthcare",
                "mechanic": "automotive",
                "vehicle": "automotive",
                "bike_repair": "automotive",
                "solar": "green-jobs",
                "tailoring": "apparel",
                "sewing": "apparel",
            }
            mapped = alias_map.get(candidate_slug)
            if mapped and mapped in active_sectors:
                normalized.interested_sector_slug = mapped
            else:
                unresolved.append("interested_sector_slug")

    # 5. Notional Hours
    if raw_fields.notional_hours_range:
        normalized.notional_hours_range = normalize_notional_hours(raw_fields.notional_hours_range)

    # 6. PwD
    if raw_fields.pwd_status is not None or raw_fields.pwd_categories:
        is_pwd, cats = normalize_pwd(raw_fields.pwd_categories or raw_fields.pwd_status)
        normalized.pwd_status = is_pwd
        normalized.pwd_categories = cats

    # 7. Lists
    normalized.skills = [s.strip() for s in raw_fields.skills if s.strip()]
    normalized.tools_familiarity = [t.strip() for t in raw_fields.tools_familiarity if t.strip()]

    # 8. Preferences
    normalized.mobility_preference = raw_fields.mobility_preference
    normalized.primary_goal = raw_fields.primary_goal
    normalized.name = raw_fields.name

    return normalized, unresolved


async def call_groq_chat_completion(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    timeout_seconds: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Executes live chat completion request to Groq API with strict JSON mode.
    Handles network errors, rate limits, timeouts, and API key absence gracefully.
    """
    api_key = settings.GROQ_API_KEY
    if not api_key or not settings.is_groq_configured:
        raise ValueError("GROQ_API_KEY is not configured on the backend server.")

    target_model = model or settings.GROQ_MODEL
    url = f"{settings.GROQ_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": target_model,
        "messages": messages,
        "temperature": 0.1,  # Low temperature for deterministic extraction
        "response_format": {"type": "json_object"},
        "max_tokens": 1000,
    }
    timeout = timeout_seconds or settings.GROQ_TIMEOUT_SECONDS

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)
        if response.status_code == 429:
            raise RuntimeError("Groq API rate limit exceeded (429).")
        if response.status_code >= 500:
            raise RuntimeError(f"Groq upstream server error ({response.status_code}).")
        if not response.is_success:
            err_msg = response.text
            raise RuntimeError(f"Groq API call failed ({response.status_code}): {err_msg}")

        return response.json()


async def interpret_transcript_with_groq(
    transcript: str,
    current_stage: InterviewStage,
    current_profile: StructuredBeneficiaryProfile,
    lang: str = "hi",
    active_sectors: Optional[List[str]] = None,
    question_context: Optional[str] = None,
    client: Optional[Client] = None,
) -> InterpretationResult:
    """
    High-level entry point: invokes Groq LLM to interpret citizen dialogue,
    performs contradiction detection, and validates against authoritative rules.
    """
    logger.info(f"groq_interpretation_started: stage={current_stage.value} lang={lang}")

    # Build active sectors list if not supplied
    if not active_sectors:
        try:
            sec_objs = list_sectors(client=client)
            active_sectors = [s.id for s in sec_objs]
        except Exception:
            active_sectors = ["agriculture", "it-ites", "electronics-hw", "healthcare", "automotive", "green-jobs"]

    # Profile context summary for contradiction detection & grounding
    profile_ctx = {
        "name": current_profile.name,
        "education": current_profile.education,
        "education_label": current_profile.education_label,
        "vocational_training": current_profile.vocational_training,
        "vocational_training_type": current_profile.vocational_training_type,
        "work_experience_years": current_profile.work_experience_years,
        "interested_sector_id": current_profile.interested_sector_id,
        "pwd_status": current_profile.pwd_status,
        "pwd_categories": current_profile.pwd_categories,
    }

    user_prompt = f"""INTERVIEW CONTEXT:
- Active Stage: {current_stage.value}
- Beneficiary Language: {lang}
- Current Profile Facts: {json.dumps(profile_ctx, ensure_ascii=False)}
- Current Question Context: {question_context or 'None'}
- Authoritative Available Sectors: {json.dumps(active_sectors[:20])}

BENEFICIARY STATEMENT / VOICE TRANSCRIPT:
\"\"\"{transcript}\"\"\"

Extract structured fields according to the schema. If ambiguous, provide a short clarification question in {lang}."""

    messages = [
        {"role": "system", "content": GROQ_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    try:
        api_res = await call_groq_chat_completion(messages)
        content = api_res.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        cleaned_json = _sanitize_llm_json(content)
        parsed = json.loads(cleaned_json)

        # Parse raw extracted fields
        raw_fields = ExtractedProfileFields(**parsed.get("extracted_fields", {}))
        confidence = parsed.get("confidence", {})

        # Run strict validation layer
        normalized_fields, unresolved = validate_and_normalize_extracted_fields(raw_fields, active_sectors)

        # Contradiction check against prior profile facts
        contradictions, contra_clarify = detect_profile_contradictions(normalized_fields, current_profile, lang=lang)

        needs_clarification = parsed.get("needs_clarification", False) or len(contradictions) > 0
        clarification_q = contra_clarify or parsed.get("clarification_question")

        # Confidence thresholding (Section 10)
        # If confidence is below 0.60 for the target field in this stage, flag clarification
        target_field_map = {
            InterviewStage.EDUCATION: "education",
            InterviewStage.VOCATIONAL_TRAINING: "vocational_training_type",
            InterviewStage.EXPERIENCE: "experience_years",
            InterviewStage.SECTOR: "interested_sector_slug",
            InterviewStage.CAPACITY_HOURS: "notional_hours_range",
            InterviewStage.PWD: "pwd_status",
        }
        target_f = target_field_map.get(current_stage)
        if target_f and target_f in confidence and confidence[target_f] < 0.60:
            needs_clarification = True
            if not clarification_q:
                clarification_q = {
                    "hi": "कृपया अपनी बात थोड़ा और स्पष्ट करके बताएं।",
                    "bn": "অনুগ্রহ করে আপনার উত্তরটি আর একটু স্পষ্ট করে বলুন।",
                    "en": "Could you please clarify your answer?",
                }.get(lang, "Could you please clarify your answer?")

        result = InterpretationResult(
            extracted_fields=normalized_fields,
            confidence=confidence,
            unresolved_fields=unresolved,
            contradictions=contradictions,
            needs_clarification=needs_clarification,
            clarification_question=clarification_q,
            reasoning_summary=parsed.get("reasoning_summary"),
        )
        logger.info(f"groq_interpretation_completed: needs_clarification={needs_clarification}")
        return result

    except Exception as exc:
        logger.warning(f"groq_interpretation_failed: {exc}; falling back gracefully.")
        # Graceful degradation fallback (Section 21)
        fallback_fields = ExtractedProfileFields()
        # Simple regex heuristics as resilient zero-crash fallback
        if current_stage == InterviewStage.EXPERIENCE:
            fallback_fields.experience_years = normalize_experience_years(transcript)
        elif current_stage == InterviewStage.EDUCATION:
            fallback_fields.education = normalize_education(transcript)
        elif current_stage == InterviewStage.VOCATIONAL_TRAINING:
            is_tr, tr_type = normalize_vocational_training(transcript)
            fallback_fields.vocational_training_has = is_tr
            fallback_fields.vocational_training_type = tr_type

        return InterpretationResult(
            extracted_fields=fallback_fields,
            confidence={"fallback": 0.5},
            unresolved_fields=[current_stage.value],
            needs_clarification=False,
            reasoning_summary="Fallback deterministic parser used due to LLM unavailability.",
        )


async def interpret_and_apply_to_session(
    client: Client,
    interview_id: UUID,
    beneficiary_id: UUID,
    transcript: str,
    lang: str = "hi",
    question_id: Optional[str] = None,
    apply_to_profile: bool = True,
) -> InterpretTranscriptResponse:
    """
    End-to-end pipeline:
    1. Loads interview session & profile.
    2. Checks if deterministic parser can resolve without LLM.
    3. If natural language, calls Groq interpretation & validation.
    4. If clarification needed, constructs clarification question on the session state.
    5. If valid, updates structured profile and advances stage machine.
    """
    i_row = _load_interview_row(client, interview_id, beneficiary_id)
    b_row = _load_beneficiary_row(client, beneficiary_id)
    profile = get_or_initialize_profile(i_row, b_row)
    current_stage, _ = determine_current_stage(profile, i_row.get("status", "draft"))

    # 1. Deterministic pre-match if active question has defined options
    current_q = generate_adaptive_question(current_stage, profile, lang=lang, client=client)
    if current_q and current_q.options:
        matched_opt = deterministic_pre_match(transcript, current_q.options)
        if matched_opt:
            # Deterministic resolution successful: bypass Groq call!
            logger.info("deterministic_pre_match_hit: bypassing Groq call")
            submission = AdaptiveAnswerSubmit(
                question_id=current_q.question_id,
                raw_answer=matched_opt.label,
                normalized_answer=matched_opt.value,
                input_method=InputMethod.VOICE,
                language=lang,
            )
            updated_state = submit_answer_to_interview(client, interview_id, beneficiary_id, submission)
            return InterpretTranscriptResponse(
                interview_id=interview_id,
                beneficiary_id=beneficiary_id,
                interpretation=InterpretationResult(
                    extracted_fields=ExtractedProfileFields(),
                    confidence={"deterministic": 1.0},
                    reasoning_summary="Resolved deterministically via exact option match.",
                ),
                updated_state=updated_state,
                clarification_needed=False,
            )

    # 2. Invoke Groq conversational extraction layer
    interpretation = await interpret_transcript_with_groq(
        transcript=transcript,
        current_stage=current_stage,
        current_profile=profile,
        lang=lang,
        question_context=current_q.question_text if current_q else None,
        client=client,
    )

    # 3. Handle Clarification State
    if interpretation.needs_clarification and interpretation.clarification_question:
        logger.info("clarification_requested: constructing clarification question")
        # Build conversational clarification question for the active stage
        clarification_question = AdaptiveQuestion(
            question_id=f"clarify_{current_stage.value}",
            stage=current_stage,
            title="स्पष्टीकरण (Clarification)",
            question_text=interpretation.clarification_question,
            input_type=QuestionInputType.VOICE_TEXT,
            field_target=current_stage.value,
            reason="Prior statement was ambiguous, incomplete, or contradictory with recorded facts.",
            is_clarification=True,
            help_text="Speak or type your clarification clearly.",
        )
        state = get_adaptive_interview_state(client, interview_id, beneficiary_id)
        state.current_question = clarification_question
        return InterpretTranscriptResponse(
            interview_id=interview_id,
            beneficiary_id=beneficiary_id,
            interpretation=interpretation,
            updated_state=state,
            clarification_needed=True,
            clarification_question=interpretation.clarification_question,
        )

    # 4. Apply Valid Extracted Fields to Profile (Section 5)
    updated_state = None
    if apply_to_profile:
        fields = interpretation.extracted_fields
        # Map extracted fields to adaptive answer submission
        if current_stage == InterviewStage.EDUCATION and fields.education:
            sub = AdaptiveAnswerSubmit(
                question_id="edu_highest_level",
                raw_answer=transcript,
                normalized_answer=fields.education,
                input_method=InputMethod.VOICE,
                language=lang,
            )
            updated_state = submit_answer_to_interview(client, interview_id, beneficiary_id, sub)

        elif current_stage == InterviewStage.VOCATIONAL_TRAINING and fields.vocational_training_type:
            sub = AdaptiveAnswerSubmit(
                question_id="voc_training_type",
                raw_answer=transcript,
                normalized_answer=fields.vocational_training_type,
                input_method=InputMethod.VOICE,
                language=lang,
            )
            updated_state = submit_answer_to_interview(client, interview_id, beneficiary_id, sub)

        elif current_stage == InterviewStage.EXPERIENCE and fields.experience_years is not None:
            sub = AdaptiveAnswerSubmit(
                question_id="exp_years",
                raw_answer=transcript,
                normalized_answer=fields.experience_years,
                input_method=InputMethod.VOICE,
                language=lang,
            )
            updated_state = submit_answer_to_interview(client, interview_id, beneficiary_id, sub)

        elif current_stage == InterviewStage.SECTOR and fields.interested_sector_slug:
            sub = AdaptiveAnswerSubmit(
                question_id="sec_interested_sector",
                raw_answer=transcript,
                normalized_answer=fields.interested_sector_slug,
                input_method=InputMethod.VOICE,
                language=lang,
            )
            updated_state = submit_answer_to_interview(client, interview_id, beneficiary_id, sub)

        elif current_stage == InterviewStage.CAPACITY_HOURS and fields.notional_hours_range:
            sub = AdaptiveAnswerSubmit(
                question_id="cap_notional_hours",
                raw_answer=transcript,
                normalized_answer=fields.notional_hours_range,
                input_method=InputMethod.VOICE,
                language=lang,
            )
            updated_state = submit_answer_to_interview(client, interview_id, beneficiary_id, sub)

        elif current_stage == InterviewStage.PWD and fields.pwd_status is not None:
            sub = AdaptiveAnswerSubmit(
                question_id="pwd_status_category",
                raw_answer=transcript,
                normalized_answer=fields.pwd_categories if fields.pwd_categories else ("none" if not fields.pwd_status else "pwd_ld"),
                input_method=InputMethod.VOICE,
                language=lang,
            )
            updated_state = submit_answer_to_interview(client, interview_id, beneficiary_id, sub)

        elif current_stage == InterviewStage.BASIC_PROFILE and fields.name:
            sub = AdaptiveAnswerSubmit(
                question_id="bio_name",
                raw_answer=fields.name,
                normalized_answer=fields.name,
                input_method=InputMethod.VOICE,
                language=lang,
            )
            updated_state = submit_answer_to_interview(client, interview_id, beneficiary_id, sub)

        else:
            # Multi-field update or general statement: update profile directly
            if fields.skills:
                profile.skills = list(set(profile.skills + fields.skills))
            if fields.tools_familiarity:
                profile.tools_familiarity = list(set(profile.tools_familiarity + fields.tools_familiarity))
                profile.competency_evidence.technical_skills = profile.tools_familiarity
            if fields.experience_years is not None and profile.work_experience_years == 0.0:
                profile.work_experience_years = fields.experience_years
                profile.work_experience_label = transcript
            if fields.vocational_training_type and not profile.vocational_training_type:
                profile.vocational_training_type = fields.vocational_training_type
                profile.vocational_training = fields.vocational_training_type != "none"

            # Persist directly
            ext = profile.model_dump(mode="json", exclude_none=True)
            profile.completeness_percentage = calculate_completeness(profile)
            ext["completeness_percentage"] = profile.completeness_percentage
            client.table("interview_sessions").update(json_safe({
                "extracted_profile": ext,
                "updated_at": _now().isoformat(),
            })).eq("id", str(interview_id)).execute()
            updated_state = get_adaptive_interview_state(client, interview_id, beneficiary_id)

    return InterpretTranscriptResponse(
        interview_id=interview_id,
        beneficiary_id=beneficiary_id,
        interpretation=interpretation,
        updated_state=updated_state,
        clarification_needed=False,
    )


async def explain_nsqf_recommendations_with_groq(
    beneficiary_id: UUID,
    interview_id: Optional[UUID],
    recommendations_response: NSQFRecommendationResponse,
    profile: StructuredBeneficiaryProfile,
    lang: LanguageCode = "hi",
    top_n: int = 3,
) -> ExplainRecommendationsResponse:
    """
    Generates a natural-language conversational explanation of deterministic NSQF recommendations.
    Enforces strict architectural boundaries:
    1. Zero course selection or modification (Groq only explains the real courses provided).
    2. Zero hallucination of benefits or placement outcomes.
    3. Grounded strictly in the deterministic match reasons.
    4. Deterministic template fallback if Groq is unconfigured or fails.
    """
    recs = recommendations_response.recommendations[:top_n]
    if not recs:
        # No recommendations to explain
        fallback_msg = {
            "hi": "वर्तमान प्रोफ़ाइल के लिए कोई प्रत्यक्ष सरकारी पाठ्यक्रम उपलब्ध नहीं हो सका। कृपया अपनी रुचि या कौशल अपडेट करें।",
            "bn": "আপনার বর্তমান তথ্যের সাথে মিল রেখে সরাসরি কোনো কোর্স পাওয়া যায়নি। অনুগ্রহ করে আপনার তথ্য আপডেট করুন।",
            "en": "No matching government qualifications were found for your current profile parameters. Please update your preferences.",
        }.get(lang, "No matching qualifications were found. Please update your profile.")
        return ExplainRecommendationsResponse(
            beneficiary_id=beneficiary_id,
            interview_id=interview_id,
            language=lang,
            overall_explanation=fallback_msg,
            items=[],
        )

    # Prepare structured input for Groq explanation
    courses_payload = []
    for r in recs:
        courses_payload.append({
            "rank": r.rank,
            "q_code": r.q_code,
            "title": r.title,
            "sector": r.sector_name,
            "nsqf_level": r.nsqf_level,
            "duration": r.notional_hours_range,
            "reasons": r.match_reasons[:3],
        })

    profile_summary = {
        "sector": profile.interested_sector_name or profile.interested_sector_id,
        "education": profile.education_label or profile.education,
        "experience": f"{profile.work_experience_years} years",
        "skills": profile.skills[:5],
    }

    groq_prompt = f"""You are the voice assistant for Utthan (उत्थान).
Your task is to explain why specific official NSQF qualifications were deterministically matched to this citizen, speaking naturally in {lang}.

CRITICAL BOUNDARIES:
1. Explain ONLY the {len(recs)} courses listed below. DO NOT recommend any different courses.
2. DO NOT change course codes, titles, or NSQF levels.
3. Ground your explanation strictly on the provided match reasons.
4. Keep the explanation warm, respectful, concise (1-2 sentences per course), and easy to understand over voice.

CITIZEN PROFILE:
{json.dumps(profile_summary, ensure_ascii=False)}

RECOMMENDED COURSES:
{json.dumps(courses_payload, ensure_ascii=False)}

RESPOND ONLY WITH VALID JSON:
{{
  "overall_explanation": "1-2 sentence spoken summary in {lang}",
  "items": [
    {{
      "q_code": "string",
      "spoken_summary": "1-2 sentence spoken explanation in {lang}"
    }}
  ]
}}"""

    messages = [
        {
            "role": "system",
            "content": "You are a helpful, respectful Indian public service voice assistant. Always respond with strict valid JSON.",
        },
        {"role": "user", "content": groq_prompt},
    ]

    try:
        if settings.is_groq_configured:
            api_res = await call_groq_chat_completion(messages)
            content = api_res.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            cleaned = _sanitize_llm_json(content)
            parsed = json.loads(cleaned)
            
            explanation_items = []
            parsed_items = {item.get("q_code"): item.get("spoken_summary") for item in parsed.get("items", [])}
            
            for r in recs:
                summary = parsed_items.get(r.q_code)
                if not summary:
                    # Per-item fallback
                    summary = f"{r.title} ({r.sector_name}) - NSQF Level {r.nsqf_level}."
                explanation_items.append(RecommendationExplanationItem(
                    q_code=r.q_code,
                    title=r.title,
                    sector_name=r.sector_name,
                    nsqf_level=r.nsqf_level,
                    rank=r.rank,
                    spoken_summary=summary,
                    key_match_reasons=r.match_reasons[:3],
                ))

            overall = parsed.get("overall_explanation") or f"Here are the top {len(recs)} courses matched to your profile."
            return ExplainRecommendationsResponse(
                beneficiary_id=beneficiary_id,
                interview_id=interview_id,
                language=lang,
                overall_explanation=overall,
                items=explanation_items,
            )
    except Exception as exc:
        logger.warning(f"Groq recommendation explanation failed or skipped ({exc}); using deterministic template fallback.")

    # Robust Deterministic Template Fallback (100% offline & error resilient)
    first_course = recs[0]
    fallback_overall = {
        "hi": f"आपके साक्षात्कार और व्यावहारिक अनुभव के आधार पर हमने आपके लिए {len(recs)} सरकारी NSQF पाठ्यक्रम चुने हैं। आपका शीर्ष पाठ्यक्रम '{first_course.title}' है, जो {first_course.sector_name} क्षेत्र में NSQF स्तर {first_course.nsqf_level} का है।",
        "bn": f"আপনার অভিজ্ঞতা ও দক্ষতার ভিত্তিতে আমরা আপনার জন্য {len(recs)}টি সরকারি NSQF কোর্স বেছে নিয়েছি। প্রধান কোর্স হলো '{first_course.title}', যা {first_course.sector_name} বিভাগে NSQF লেভেল {first_course.nsqf_level}।",
        "en": f"Based on your verified skills and interview assessment, we matched {len(recs)} official NSQF qualifications. Your top match is '{first_course.title}' in {first_course.sector_name} at NSQF Level {first_course.nsqf_level}.",
    }.get(lang, f"Matched {len(recs)} NSQF qualifications. Top match: '{first_course.title}' (Level {first_course.nsqf_level}).")

    fallback_items = []
    for r in recs:
        item_summary = {
            "hi": f"यह पाठ्यक्रम ({r.title}) आपके {r.sector_name} अनुभव और कार्य प्राथमिकताओं से मेल खाता है।",
            "bn": f"এই কোর্সটি ({r.title}) আপনার {r.sector_name} দক্ষতা ও পছন্দের সাথে মানানসই।",
            "en": f"This qualification ({r.title}) aligns directly with your {r.sector_name} background and practical competencies.",
        }.get(lang, f"{r.title} aligns with your {r.sector_name} background.")
        fallback_items.append(RecommendationExplanationItem(
            q_code=r.q_code,
            title=r.title,
            sector_name=r.sector_name,
            nsqf_level=r.nsqf_level,
            rank=r.rank,
            spoken_summary=item_summary,
            key_match_reasons=r.match_reasons[:3],
        ))

    return ExplainRecommendationsResponse(
        beneficiary_id=beneficiary_id,
        interview_id=interview_id,
        language=lang,
        overall_explanation=fallback_overall,
        items=fallback_items,
    )

