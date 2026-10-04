import React, { useEffect, useState } from 'react';
import { 
  Sparkles, MapPin, ArrowRight, Filter, AlertCircle, 
  CheckCircle2, Compass, ChevronDown, ChevronUp, XCircle,
  GraduationCap, Clock, Award, ShieldCheck, Building2,
  Volume2, VolumeX, Loader2
} from 'lucide-react';
import { 
  fetchOpportunities, 
  fetchRecommendations, 
  fetchNSQFRecommendations, 
  explainInterviewRecommendations,
  ApiError 
} from '../services/api';
import { speakWithSarvamAI, stopAIVoice } from '../services/aiService';
import { mapOpportunity, mapNSQFQualification } from '../services/opportunityAdapter';
import { getUIText } from '../data/uiTranslations';

export default function OpportunitiesPage({ 
  currentLanguage,
  stateId,
  beneficiarySession,
  onSelectOpportunity,
  onStartInterview,
  onInvalidSession,
}) {
  const [activeTab, setActiveTab] = useState('nsqf'); // 'nsqf' | 'local_batches'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [nsqfRecommendations, setNsqfRecommendations] = useState([]);
  const [localOpportunities, setLocalOpportunities] = useState([]);
  const [ineligibleOpportunities, setIneligibleOpportunities] = useState([]);
  const [nsqfStatus, setNsqfStatus] = useState('none'); // 'none' | 'incomplete' | 'ready' | 'empty' | 'insufficient_profile'
  const [missingFields, setMissingFields] = useState([]);
  const [showIneligible, setShowIneligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [recommendationExplanation, setRecommendationExplanation] = useState('');
  const [isSpeakingExplanation, setIsSpeakingExplanation] = useState(false);
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);
  const langId = currentLanguage?.id || 'en';

  useEffect(() => {
    return () => {
      stopAIVoice();
    };
  }, []);

  const toggleSpeakExplanation = () => {
    if (isSpeakingExplanation) {
      stopAIVoice();
      setIsSpeakingExplanation(false);
      return;
    }
    if (!recommendationExplanation) return;
    setIsSpeakingExplanation(true);
    speakWithSarvamAI({
      text: recommendationExplanation,
      languageId: langId,
      speaker: 'priya',
    }).finally(() => {
      setIsSpeakingExplanation(false);
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setRecommendationExplanation('');

    const hasSession = Boolean(beneficiarySession?.beneficiaryId && beneficiarySession?.sessionToken);

    // 1. Fetch Local Opportunities
    const catalogPromise = fetchOpportunities({ stateId }).catch(() => ({ opportunities: [] }));

    // 2. Fetch Authoritative NSQF Recommendations (Engine 2.0)
    const nsqfPromise = hasSession
      ? fetchNSQFRecommendations(beneficiarySession.beneficiaryId, beneficiarySession.sessionToken).catch(() => null)
      : Promise.resolve(null);

    // 3. Fetch Legacy Opportunity Recommendations (for Local Batches)
    const legacyRecsPromise = hasSession
      ? fetchRecommendations(beneficiarySession.beneficiaryId, beneficiarySession.sessionToken).catch(() => null)
      : Promise.resolve(null);

    Promise.all([catalogPromise, nsqfPromise, legacyRecsPromise])
      .then(([catalogPayload, nsqfPayload, legacyRecsPayload]) => {
        if (cancelled) return;

        // Process Local Opportunities
        const rawLocalList = (catalogPayload?.opportunities || []).map(opp => mapOpportunity(opp));
        const catalogMap = new Map(rawLocalList.map(opp => [opp.id, opp]));

        if (legacyRecsPayload?.recommendations?.length > 0) {
          const mappedLocal = legacyRecsPayload.recommendations.map(r => {
            const catItem = catalogMap.get(r.opportunity_id) || {};
            return mapOpportunity(
              {
                ...catItem,
                id: r.opportunity_id,
                title: r.title || catItem.title,
                state_id: r.state_id ?? catItem.state_id,
                district_id: r.district_id ?? catItem.district_id,
                nsqf_level: r.nsqf_level ?? catItem.nsqf_level,
                qp_code: r.qp_code ?? catItem.qp_code,
              },
              {
                matchScore: r.score,
                matchedCriteria: r.matched_criteria || [],
                unmetCriteria: r.unmet_criteria || [],
                reasons: r.reasons || [],
                whyMatches: r.reasons?.[0] || null,
                eligible: true,
              }
            );
          });
          setLocalOpportunities(mappedLocal);
        } else {
          setLocalOpportunities(rawLocalList);
        }

        // Process Ineligible sample
        if (legacyRecsPayload?.ineligible_opportunities) {
          const mappedInelig = legacyRecsPayload.ineligible_opportunities.map(inItem => {
            const catItem = catalogMap.get(inItem.opportunity_id) || {};
            return mapOpportunity(
              {
                ...catItem,
                id: inItem.opportunity_id,
                title: inItem.title || catItem.title,
              },
              {
                matchScore: 0,
                matchedCriteria: inItem.matched_criteria || [],
                unmetCriteria: inItem.unmet_criteria || [],
                reasons: inItem.reasons || inItem.unmet_criteria || [],
                whyMatches: inItem.unmet_criteria?.[0] || null,
                eligible: false,
              }
            );
          });
          setIneligibleOpportunities(mappedInelig);
        }

        // Process Authoritative NSQF Recommendations
        if (nsqfPayload) {
          if (nsqfPayload.status === 'insufficient_profile') {
            setNsqfStatus('insufficient_profile');
            setMissingFields(nsqfPayload.missing_profile_fields || []);
            setNsqfRecommendations([]);
          } else if (nsqfPayload.status === 'no_match') {
            setNsqfStatus('empty');
            setNsqfRecommendations([]);
          } else if (nsqfPayload.recommendations?.length > 0) {
            setNsqfStatus('ready');
            const mappedNsqf = nsqfPayload.recommendations.map(rec => mapNSQFQualification(rec));
            setNsqfRecommendations(mappedNsqf);

            // Fetch natural-language explanation grounded in deterministic recommendations
            if (hasSession) {
              setIsExplanationLoading(true);
              explainInterviewRecommendations(
                beneficiarySession.interviewId || beneficiarySession.beneficiaryId,
                beneficiarySession.sessionToken,
                langId,
                nsqfPayload.recommendations.slice(0, 3).map(r => ({
                  q_code: r.q_code,
                  title: r.title,
                  sector: r.sector,
                  nsqf_level: r.nsqf_level,
                  notional_hours: r.notional_hours,
                  match_reasons: r.reasons || [],
                }))
              ).then((expRes) => {
                if (!cancelled && expRes?.overall_explanation) {
                  setRecommendationExplanation(expRes.overall_explanation);
                }
              }).catch(() => {})
              .finally(() => {
                if (!cancelled) setIsExplanationLoading(false);
              });
            }
          } else {
            setNsqfStatus('empty');
            setNsqfRecommendations([]);
          }
        } else {
          setNsqfStatus(hasSession ? 'incomplete' : 'none');
          setNsqfRecommendations([]);
        }
      })
      .catch((requestError) => {
        if (cancelled) return;
        if (requestError?.status === 401 || requestError?.status === 403) {
          if (onInvalidSession) onInvalidSession();
        }
        setError(requestError instanceof ApiError ? requestError.message : 'Course recommendations could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [beneficiarySession?.beneficiaryId, beneficiarySession?.sessionToken, stateId, retryToken]);

  // Dynamic sectors extracted from currently active list
  const activeItems = activeTab === 'nsqf' ? nsqfRecommendations : localOpportunities;
  const availableSectors = ['All', ...Array.from(new Set(activeItems.map(item => item.category).filter(Boolean))).sort()];

  const filtered = selectedCategory === 'All'
    ? activeItems
    : activeItems.filter(o => (o.category || '').toLowerCase().includes(selectedCategory.toLowerCase()));

  return (
    <div className="relative z-20 flex-1 px-4 sm:px-6 lg:px-12 py-8 max-w-5xl mx-auto w-full">
      {/* 1. Header Banner */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-3 py-1 rounded-full bg-[#134e40]/10 text-[#134e40] text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#e69943]" />
            {nsqfStatus === 'ready' 
              ? getUIText('opportunities', 'nsqfEngine', langId)
              : getUIText('opportunities', 'aiVerified', langId)}
          </span>
          <span className="text-xs text-[#718078]">
            {getUIText('opportunities', 'nqrCourses', langId)}
          </span>
        </div>
        <h1 className="font-serif-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-[#134e40] mb-2">
          {nsqfStatus === 'ready' 
            ? getUIText('opportunities', 'nsqfPathways', langId)
            : getUIText('opportunities', 'pageTitle', langId)}
        </h1>
        <p className="text-sm sm:text-base text-[#37474F] max-w-2xl leading-relaxed">
          {getUIText('opportunities', 'nsqfSubtitle', langId)}
        </p>
      </div>

      {/* 2. Source Mode Tabs (Distinguishing Qualifications vs Local Batches) */}
      <div className="flex border-b border-[#cbd5e1] mb-6 gap-3">
        <button
          onClick={() => { setActiveTab('nsqf'); setSelectedCategory('All'); }}
          className={`pb-3 px-2 text-sm sm:text-base font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'nsqf'
              ? 'border-[#134e40] text-[#134e40]'
              : 'border-transparent text-[#718078] hover:text-[#134e40]'
          }`}
        >
          <GraduationCap className="w-5 h-5 text-[#e69943]" />
          <span>{getUIText('opportunities', 'nsqfTab', langId)} ({nsqfRecommendations.length})</span>
        </button>
        <button
          onClick={() => { setActiveTab('local_batches'); setSelectedCategory('All'); }}
          className={`pb-3 px-2 text-sm sm:text-base font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'local_batches'
              ? 'border-[#134e40] text-[#134e40]'
              : 'border-transparent text-[#718078] hover:text-[#134e40]'
          }`}
        >
          <Building2 className="w-5 h-5 text-[#134e40]" />
          <span>{getUIText('opportunities', 'localBatchesTab', langId)} ({localOpportunities.length})</span>
        </button>
      </div>

      {/* 3. Status Callouts */}
      {!loading && !error && activeTab === 'nsqf' && nsqfStatus === 'insufficient_profile' && (
        <div className="mb-8 p-5 sm:p-6 rounded-2xl bg-[#FFF8EE] border border-[#FAD7AB] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Compass className="w-6 h-6 text-[#e69943] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-[#9e4c16] mb-1">
                {getUIText('opportunities', 'profileReqTitle', langId)}
              </h2>
              <p className="text-xs sm:text-sm text-[#7a3b0e] leading-relaxed max-w-xl">
                {getUIText('opportunities', 'profileReqDesc', langId)}
              </p>
            </div>
          </div>
          {onStartInterview && (
            <button
              onClick={onStartInterview}
              className="px-5 py-2.5 rounded-full bg-[#134e40] hover:bg-[#0d3b30] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
            >
              <span>{getUIText('opportunities', 'continueInterview', langId)}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {!loading && !error && activeTab === 'nsqf' && nsqfStatus === 'empty' && (
        <div className="mb-8 p-5 sm:p-6 rounded-2xl bg-white/95 border border-[#b8ded6] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-[#718078] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-[#134e40] mb-1">
                {getUIText('opportunities', 'noMatchTitle', langId)}
              </h2>
              <p className="text-xs sm:text-sm text-[#37474F] leading-relaxed max-w-xl">
                {getUIText('opportunities', 'noMatchDesc', langId)}
              </p>
            </div>
          </div>
          {onStartInterview && (
            <button
              onClick={onStartInterview}
              className="px-5 py-2.5 rounded-full bg-[#134e40] hover:bg-[#0d3b30] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
            >
              <span>{getUIText('opportunities', 'updateProfile', langId)}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {!loading && !error && (nsqfStatus === 'none' || nsqfStatus === 'incomplete') && onStartInterview && (
        <div className="mb-8 p-4 sm:p-5 rounded-2xl bg-white/95 border border-[#b8ded6] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 text-[#37474F]">
            <Sparkles className="w-4 h-4 text-[#e69943] shrink-0" />
            <span>{getUIText('opportunities', 'voiceInterviewPrompt', langId)}</span>
          </div>
          <button
            onClick={onStartInterview}
            className="font-bold text-[#134e40] hover:underline flex items-center gap-1 shrink-0"
          >
            <span>{getUIText('opportunities', 'startVoiceInterview', langId)}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4. Loading & Error States */}
      {loading && (
        <div className="bg-white/95 rounded-2xl p-8 border border-[#b8ded6] text-center text-sm text-[#718078] shadow-sm">
          <Sparkles className="w-6 h-6 text-[#134e40] animate-pulse mx-auto mb-2" />
          {getUIText('opportunities', 'loadingOpps', langId)}
        </div>
      )}

      {!loading && error && (
        <div className="bg-white/95 rounded-2xl p-6 border border-[#FAD7AB] text-sm text-[#7a3b0e] flex items-center justify-between gap-4 mb-6 shadow-sm">
          <span>{error}</span>
          <button onClick={() => setRetryToken((token) => token + 1)} className="font-bold text-[#134e40] hover:underline whitespace-nowrap">
            Retry loading
          </button>
        </div>
      )}

      {/* 3b. Conversational Natural-Language Explanation & TTS Playback */}
      {!loading && !error && activeTab === 'nsqf' && nsqfStatus === 'ready' && (recommendationExplanation || isExplanationLoading) && (
        <div className="mb-6 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-emerald-50/90 to-[#FAF7F0] border border-emerald-200 shadow-sm animate-in fade-in">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#e69943] shrink-0" />
              <span className="text-xs font-bold text-[#134e40] uppercase tracking-wider">
                {getUIText('opportunities', 'personalizedSummary', langId)}
              </span>
            </div>
            {recommendationExplanation && (
              <button
                onClick={toggleSpeakExplanation}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                  isSpeakingExplanation
                    ? 'bg-amber-600 text-white animate-pulse'
                    : 'bg-[#134e40] hover:bg-[#0d3b30] text-white'
                }`}
                title={isSpeakingExplanation ? getUIText('opportunities', 'stopVoice', langId) : getUIText('opportunities', 'listenExplanation', langId)}
              >
                {isSpeakingExplanation ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>{getUIText('opportunities', 'stopVoice', langId)}</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{getUIText('opportunities', 'listenExplanation', langId)}</span>
                  </>
                )}
              </button>
            )}
          </div>
          {isExplanationLoading ? (
            <div className="flex items-center gap-2 text-xs text-[#718078] py-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#134e40]" />
              <span>{getUIText('opportunities', 'generatingExplanation', langId)}</span>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-[#263238] leading-relaxed">
              {recommendationExplanation}
            </p>
          )}
        </div>
      )}

      {/* 5. Sector Filter Pills */}
      {!loading && !error && availableSectors.length > 2 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
          <span className="text-xs font-semibold text-[#718078] uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> {getUIText('opportunities', 'sectorFilter', langId)}
          </span>
          {availableSectors.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap active:scale-95 ${
                selectedCategory === cat
                  ? 'bg-[#134e40] text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-[#37474F] border border-[#cbd5e1]'
              }`}
            >
              {cat === 'All' ? getUIText('opportunities', 'all', langId) : cat}
            </button>
          ))}
        </div>
      )}

      {/* 6. Primary Qualifications / Opportunities Grid */}
      {!loading && !error && (
        <div className="grid grid-cols-1 gap-5 mb-8">
          {filtered.length === 0 && (
            <div className="bg-white/95 rounded-2xl p-6 border border-[#b8ded6] text-sm text-[#718078]">
              {getUIText('opportunities', 'noCoursesFilter', langId)}
            </div>
          )}
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white/95 rounded-2xl p-5 sm:p-6 border border-[#b8ded6] hover:border-[#134e40]/60 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-5 group"
            >
              {/* Left Content */}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {/* Match Score Badge */}
                  {typeof item.matchScore === 'number' && item.matchScore > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 flex items-center gap-1">
                      ★ {item.matchScore}% Match
                    </span>
                  )}

                  {/* Qualification vs Opportunity Distinction Pill */}
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                    item.itemType === 'qualification'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-blue-100 text-blue-900 border border-blue-300'
                  }`}>
                    {item.itemType === 'qualification' 
                      ? getUIText('opportunities', 'officialNsqfCourse', langId) 
                      : getUIText('opportunities', 'sponsoredBatch', langId)}
                  </span>

                  <span className="text-xs font-medium text-[#718078] bg-[#FAF7F0] px-2.5 py-0.5 rounded-full border border-[#cbd5e1]">
                    {item.category}
                  </span>

                  {item.nsqf_level != null && (
                    <span className="text-xs font-semibold text-[#134e40] bg-[#134e40]/10 px-2 py-0.5 rounded-md">
                      {getUIText('opportunities', 'nsqfLevel', langId)} {item.nsqf_level}
                    </span>
                  )}

                  {item.is_pwd && (
                    <span className="text-xs font-semibold text-purple-800 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {getUIText('opportunities', 'pwdTailored', langId)} {item.pwd_categories?.length > 0 ? `(${item.pwd_categories.join(', ')})` : ''}
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-[#134e40] group-hover:text-[#0d3b30] transition-colors mb-2">
                  {item.title}
                </h2>

                {item.overview && (
                  <p className="text-sm text-[#37474F] mb-3 leading-relaxed line-clamp-2">
                    {item.overview}
                  </p>
                )}

                {/* Why it matches highlight box */}
                {item.whyMatches && (
                  <div className="p-3.5 rounded-xl bg-[#FAF7F0] border border-[#b8ded6]/70 text-xs text-[#134e40] mb-3">
                    <div className="flex items-start gap-2 mb-1.5">
                      <Sparkles className="w-4 h-4 text-[#e69943] shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-[#134e40]">{getUIText('opportunities', 'whyRecommended', langId)}</strong> {item.whyMatches}
                      </span>
                    </div>

                    {item.matchedCriteria && item.matchedCriteria.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 pl-6 pt-1">
                        {item.matchedCriteria.slice(1, 4).map((crit, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            {crit}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Metadata tags */}
                <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-[#718078]">
                  {item.q_code && (
                    <span className="font-mono text-[11px] bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                      Code: {item.q_code}
                    </span>
                  )}
                  {item.duration && (
                    <span className="flex items-center gap-1 font-medium text-[#134e40]">
                      <Clock className="w-3.5 h-3.5" />
                      {item.duration}
                    </span>
                  )}
                  {item.partner && (
                    <span className="flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-[#e69943]" />
                      {item.partner}
                    </span>
                  )}
                  {item.location && item.itemType !== 'qualification' && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#134e40]" />
                      {item.location}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Action */}
              <div className="flex md:flex-col items-center justify-between md:justify-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-[#b8ded6]/50 shrink-0">
                <div className="text-left md:text-right">
                  {item.rank && (
                    <span className="text-xs font-semibold text-[#718078] block">
                      {getUIText('opportunities', 'rank', langId)} #{item.rank}
                    </span>
                  )}
                  {item.avgEarnings && (
                    <>
                      <span className="text-[11px] uppercase tracking-wider text-[#718078] block">
                        {getUIText('opportunities', 'estEarnings', langId)}
                      </span>
                      <span className="text-sm sm:text-base font-bold text-[#134e40]">{item.avgEarnings}</span>
                    </>
                  )}
                </div>

                <button
                  onClick={() => onSelectOpportunity(item)}
                  className="px-5 py-2.5 rounded-full bg-[#134e40] hover:bg-[#0d3b30] text-white text-sm font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all group-hover:shadow"
                >
                  <span>{getUIText('opportunities', 'viewDetails', langId)}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 7. Ineligible Opportunities Section (Transparent Disclosure) */}
      {!loading && !error && ineligibleOpportunities.length > 0 && activeTab === 'local_batches' && (
        <div className="pt-4 border-t border-[#b8ded6]">
          <button
            onClick={() => setShowIneligible(prev => !prev)}
            className="flex items-center justify-between w-full p-4 rounded-2xl bg-white/80 hover:bg-white border border-[#cbd5e1] text-xs sm:text-sm font-semibold text-[#718078] transition-all"
          >
            <span className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-[#94a3b8]" />
              {getUIText('opportunities', 'ineligibleSectionTitle', langId)} ({ineligibleOpportunities.length})
            </span>
            {showIneligible ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showIneligible && (
            <div className="grid grid-cols-1 gap-4 mt-4">
              {ineligibleOpportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white/60 border border-[#e2e8f0] opacity-80 hover:opacity-100 transition-opacity flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                        {getUIText('opportunities', 'criteriaUnmet', langId)}
                      </span>
                      <span className="text-xs text-[#718078]">{opp.category}</span>
                    </div>
                    <h3 className="text-base font-bold text-[#37474F] mb-1">
                      {opp.title}
                    </h3>
                    {opp.unmetCriteria && opp.unmetCriteria.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {opp.unmetCriteria.map((reason, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[11px] bg-red-50 text-red-800 px-2 py-0.5 rounded border border-red-200"
                          >
                            <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onSelectOpportunity(opp)}
                    className="px-4 py-2 rounded-full border border-[#cbd5e1] hover:border-[#134e40] text-xs font-semibold text-[#134e40] whitespace-nowrap self-start md:self-center"
                  >
                    {getUIText('opportunities', 'viewCriteria', langId)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
