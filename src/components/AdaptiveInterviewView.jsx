import React, { useState } from 'react';
import {
  Sparkles,
  Volume2,
  VolumeX,
  Mic,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  Briefcase,
  Wrench,
  Clock,
  Accessibility,
  Compass,
  Target,
  Edit2,
  Check,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { getUIText } from '../data/uiTranslations';

export default function AdaptiveInterviewView({
  adaptiveState,
  onSelectOption,
  onSubmitTextAnswer,
  onCorrectField,
  onCompleteInterview,
  onBack,
  isListening,
  voiceState,
  voiceError,
  liveTranscript,
  onStartVoice,
  onStopVoice,
  soundEnabled,
  onToggleSound,
  onReplayQuestion,
  isSpeaking,
  isSaving,
  errorMessage,
  clarificationMessage,
  langCode = 'hi',
}) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [selectedMultiOptions, setSelectedMultiOptions] = useState([]);
  const [textInput, setTextInput] = useState('');

  if (!adaptiveState) {
    return (
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-8 border border-[#b8ded6] shadow-xl text-center max-w-xl w-full">
        <Loader2 className="w-8 h-8 text-[#134e40] animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#134e40]">
          {getUIText('adaptive', 'loadingInterview', langCode)}
        </p>
      </div>
    );
  }

  const {
    current_stage,
    stage_index,
    total_stages,
    current_question,
    completeness_percentage,
    profile_summary,
    can_go_back,
    is_completed,
  } = adaptiveState;

  const isReviewStage = current_stage === 'review' || current_stage === 'completed';

  // Multi-choice toggle helper
  const handleToggleMulti = (val) => {
    setSelectedMultiOptions((prev) =>
      prev.includes(val) ? prev.filter((item) => item !== val) : [...prev, val]
    );
  };

  const submitMultiChoice = () => {
    if (selectedMultiOptions.length === 0) return;
    onSelectOption(selectedMultiOptions, selectedMultiOptions.join(', '));
    setSelectedMultiOptions([]);
  };

  const handleStartEdit = (fieldName, currentValue) => {
    setEditingField(fieldName);
    setEditValue(currentValue || '');
  };

  const handleSaveEdit = (fieldName) => {
    if (onCorrectField) {
      onCorrectField(fieldName, editValue);
    }
    setEditingField(null);
  };

  // -------------------------------------------------------------
  // REVIEW STAGE
  // -------------------------------------------------------------
  if (isReviewStage) {
    const prof = profile_summary || {};
    const comp = prof.competency_evidence || {};

    return (
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border-2 border-[#134e40]/30 shadow-xl max-w-3xl w-full animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#b8ded6]/60 mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-100 text-[#134e40]">
              <ShieldCheck className="w-5 h-5 text-[#134e40]" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#e69943] uppercase tracking-wider block">
                {getUIText('adaptive', 'officialReview', langCode)}
              </span>
              <h2 className="font-serif-heading text-xl sm:text-2xl font-bold text-[#134e40]">
                {getUIText('adaptive', 'structuredProfile', langCode)}
              </h2>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-[#718078] block">
              {getUIText('adaptive', 'completeness', langCode)}
            </span>
            <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {completeness_percentage || 100}% {getUIText('adaptive', 'complete', langCode)}
            </span>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-[#37474F] mb-6">
          {getUIText('adaptive', 'reviewProfileDesc', langCode)}
        </p>

        {/* Profile Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm mb-6 max-h-[60vh] overflow-y-auto pr-1">
          {/* Card 1: Identity & Location */}
          <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#b8ded6]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[#134e40] flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-[#e69943]" /> {getUIText('adaptive', 'locationAndCitizen', langCode)}
              </span>
            </div>
            <div className="space-y-1.5 text-[#263238]">
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'nameLabel', langCode)}</span>{' '}
                <span className="font-semibold">{prof.name || 'Citizen'}</span>
              </div>
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'languageLabel', langCode)}</span>{' '}
                <span className="font-semibold uppercase">{prof.preferred_language || langCode}</span>
              </div>
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'districtAndStateLabel', langCode)}</span>{' '}
                <span className="font-semibold">
                  {prof.district_name || prof.district_id || 'Detected District'},{' '}
                  {prof.state_name || prof.state_id || 'State'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Education & Training */}
          <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#b8ded6]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[#134e40] flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#134e40]" /> {getUIText('adaptive', 'educationAndTraining', langCode)}
              </span>
              <button
                onClick={() => handleStartEdit('education', prof.education)}
                className="text-[11px] text-[#134e40] hover:underline flex items-center gap-0.5 font-bold"
              >
                <Edit2 className="w-3 h-3" /> {getUIText('adaptive', 'edit', langCode)}
              </button>
            </div>
            {editingField === 'education' ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="px-2 py-1 text-xs border rounded bg-white flex-1"
                />
                <button
                  onClick={() => handleSaveEdit('education')}
                  className="px-2 py-1 text-xs bg-[#134e40] text-white rounded font-bold"
                >
                  {getUIText('adaptive', 'save', langCode)}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 text-[#263238]">
                <div>
                  <span className="text-gray-500">{getUIText('adaptive', 'educationLabel', langCode)}</span>{' '}
                  <span className="font-semibold capitalize">
                    {prof.education_label || prof.education?.replace('_', ' ') || 'Not specified'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{getUIText('adaptive', 'vocationalTrainingLabel', langCode)}</span>{' '}
                  <span className="font-semibold">
                    {prof.vocational_training
                      ? `Yes (${prof.vocational_training_type?.toUpperCase() || 'Vocational'})`
                      : 'None'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Experience & Occupation */}
          <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#b8ded6]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[#134e40] flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-[#134e40]" /> {getUIText('adaptive', 'workExperience', langCode)}
              </span>
              <button
                onClick={() => handleStartEdit('work_experience_years', prof.work_experience_years)}
                className="text-[11px] text-[#134e40] hover:underline flex items-center gap-0.5 font-bold"
              >
                <Edit2 className="w-3 h-3" /> {getUIText('adaptive', 'edit', langCode)}
              </button>
            </div>
            <div className="space-y-1.5 text-[#263238]">
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'durationLabel', langCode)}</span>{' '}
                <span className="font-semibold">
                  {prof.work_experience_years ? `${prof.work_experience_years} ${getUIText('adaptive', 'years', langCode)}` : getUIText('adaptive', 'fresherNoExp', langCode)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'pastOccupation', langCode)}</span>{' '}
                <span className="font-semibold">{prof.current_occupation || 'None / Entry-level'}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Interested NSQF Sector */}
          <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#b8ded6]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[#134e40] flex items-center gap-1.5">
                <Target className="w-4 h-4 text-[#134e40]" /> {getUIText('adaptive', 'nsqfSectorAndTarget', langCode)}
              </span>
            </div>
            <div className="space-y-1.5 text-[#263238]">
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'sectorLabel', langCode)}</span>{' '}
                <span className="font-bold text-[#134e40]">
                  {prof.interested_sector_name || prof.interested_sector_id || 'General'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'targetQualificationsLabel', langCode)}</span>{' '}
                <span className="font-semibold text-xs text-gray-700">
                  {prof.target_qualifications?.length > 0
                    ? prof.target_qualifications.join(', ')
                    : 'Sector-wide alignment'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 5: Practical Competencies & Evidence */}
          <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#b8ded6] md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[#134e40] flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-[#e69943]" /> {getUIText('adaptive', 'nsqfDescriptorEvidence', langCode)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#263238]">
              <div className="p-2.5 rounded-xl bg-white border border-gray-200">
                <span className="font-bold text-gray-700 block mb-0.5">
                  {getUIText('adaptive', 'profKnowledge', langCode)}
                </span>
                <span className="text-gray-600">
                  {comp.professional_knowledge?.length > 0
                    ? comp.professional_knowledge.join(', ')
                    : 'Basic trade awareness'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-gray-200">
                <span className="font-bold text-gray-700 block mb-0.5">
                  {getUIText('adaptive', 'techSkills', langCode)}
                </span>
                <span className="text-gray-600">
                  {prof.tools_familiarity?.length > 0
                    ? prof.tools_familiarity.join(', ')
                    : comp.technical_skills?.join(', ') || 'Standard hand tools'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-gray-200">
                <span className="font-bold text-gray-700 block mb-0.5">
                  {getUIText('adaptive', 'coreSkills', langCode)}
                </span>
                <span className="text-gray-600">
                  {comp.core_skills?.length > 0
                    ? comp.core_skills.join(', ')
                    : 'Oral communication, practical arithmetic'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-gray-200">
                <span className="font-bold text-gray-700 block mb-0.5">
                  {getUIText('adaptive', 'responsibility', langCode)}
                </span>
                <span className="text-gray-600">
                  {comp.responsibility_level || 'Supervised standard routine work with growth potential'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 6: Inclusion, Capacity & Preferences */}
          <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#b8ded6] md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[#134e40] flex items-center gap-1.5">
                <Accessibility className="w-4 h-4 text-[#134e40]" /> {getUIText('adaptive', 'inclusionAndPreferences', langCode)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[#263238]">
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'pwdStatus', langCode)}</span>{' '}
                <span className="font-semibold">
                  {prof.pwd_status
                    ? `PwD (${prof.pwd_categories?.join(', ') || 'Identified'})`
                    : 'Non-PwD'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'notionalHours', langCode)}</span>{' '}
                <span className="font-semibold">{prof.notional_hours_range || '201–400 Hours'}</span>
              </div>
              <div>
                <span className="text-gray-500">{getUIText('adaptive', 'mobility', langCode)}</span>{' '}
                <span className="font-semibold capitalize">
                  {prof.mobility_preference?.replace('_', ' ') || 'Within 15 km'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 border-t border-gray-100">
          <button
            onClick={onCompleteInterview}
            disabled={isSaving}
            className="px-8 py-3.5 rounded-full bg-[#134e40] hover:bg-[#0d3b30] disabled:opacity-60 text-white font-bold text-sm sm:text-base shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{getUIText('adaptive', 'confirmingProfile', langCode)}</span>
              </>
            ) : (
              <>
                <span>{getUIText('adaptive', 'confirmProfile', langCode)}</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

        {errorMessage && (
          <p className="mt-3 text-xs text-center font-semibold text-[#7a3b0e] bg-amber-50 p-2 rounded-xl border border-amber-200">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // ADAPTIVE QUESTION STAGE
  // -------------------------------------------------------------
  const q = current_question;
  if (!q) {
    return (
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-8 border border-[#b8ded6] shadow-xl text-center max-w-xl w-full">
        <p className="text-sm font-semibold text-[#134e40]">
          {getUIText('adaptive', 'processingNext', langCode)}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-[#b8ded6] shadow-xl max-w-2xl w-full flex flex-col items-center text-center transition-all animate-in fade-in duration-300">
      {/* Top Header: Badge, Step, Audio Controls */}
      <div className="w-full flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[#134e40] bg-[#FAF7F0] px-3.5 py-1.5 rounded-full border border-[#b8ded6]">
          <Sparkles className="w-3.5 h-3.5 text-[#e69943]" />
          <span>{q.title || `${getUIText('adaptive', 'stageLabel', langCode)} ${stage_index + 1}`}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-full border transition-colors ${
              soundEnabled
                ? 'bg-[#134e40] text-white border-[#134e40]'
                : 'bg-white text-[#718078] border-[#cbd5e1]'
            }`}
            title={soundEnabled ? getUIText('conversation', 'audioOn', langCode) : getUIText('conversation', 'audioMuted', langCode)}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={onReplayQuestion}
            className={`p-2 rounded-full border border-[#b8ded6] hover:bg-[#FAF7F0] text-[#134e40] transition-colors ${
              isSpeaking ? 'bg-emerald-100 animate-pulse ring-2 ring-emerald-400' : 'bg-white'
            }`}
            title={getUIText('conversation', 'reListen', langCode)}
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-6 border border-[#b8ded6]/40">
        <div
          className="bg-[#134e40] h-full transition-all duration-500 rounded-full"
          style={{ width: `${Math.max(5, completeness_percentage || ((stage_index + 1) / total_stages) * 100)}%` }}
        />
      </div>

      {/* Grounded Catalog Context (if present) */}
      {q.catalog_context && (
        <div className="mb-4 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
          <span>
            {getUIText('adaptive', 'nsqfGrounded', langCode)} {q.catalog_context.sector_name || 'Authoritative NQR Course Qualifications'}
          </span>
        </div>
      )}

      {/* Clarification prompt badge */}
      {q.is_clarification && (
        <div className="mb-3 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
          {getUIText('adaptive', 'clarificationNeeded', langCode)}
        </div>
      )}

      {/* Spoken Question Text */}
      <h2 className="font-serif-heading text-2xl sm:text-3xl md:text-4xl font-bold text-[#134e40] leading-snug mb-3 max-w-xl">
        {q.question_text}
      </h2>

      {q.help_text && <p className="text-xs text-[#718078] mb-6 max-w-lg">{q.help_text}</p>}

      {/* Dynamic Conversational Clarification / Contradiction banner */}
      {clarificationMessage && (
        <div className="mb-6 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm font-medium flex items-center gap-2 max-w-lg shadow-sm text-left animate-in fade-in">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{clarificationMessage}</span>
        </div>
      )}

      {/* Center Voice Mic Button (Sarvam STT) */}
      <div className="mb-6 flex flex-col items-center">
        <button
          onClick={isListening ? onStopVoice : onStartVoice}
          disabled={voiceState === 'transcribing' || isSaving}
          className={`relative group w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95 focus:outline-none ${
            isListening
              ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-300'
              : voiceState === 'transcribing'
                ? 'bg-amber-600 text-white animate-pulse ring-4 ring-amber-200'
                : 'bg-[#134e40] text-white hover:bg-[#0d3b30] hover:scale-105'
          }`}
          title={isListening ? getUIText('conversation', 'listeningIn', langCode) : getUIText('adaptive', 'tapToSpeakNative', langCode)}
        >
          {isListening && (
            <>
              <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75" />
              <span className="absolute -inset-2 rounded-full border-2 border-red-500 animate-pulse opacity-50" />
            </>
          )}
          {voiceState === 'transcribing' ? (
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 relative z-10 animate-spin" />
          ) : (
            <Mic className="w-8 h-8 sm:w-10 sm:h-10 relative z-10" />
          )}
        </button>

        <span className="mt-3 text-xs sm:text-sm font-semibold text-[#134e40]">
          {voiceState === 'transcribing'
            ? getUIText('adaptive', 'transcribingSarvam', langCode)
            : isListening
              ? liveTranscript
                ? `"${liveTranscript}"`
                : getUIText('adaptive', 'listeningNative', langCode)
              : isSpeaking
                ? getUIText('conversation', 'speakingQuestion', langCode)
                : getUIText('adaptive', 'tapToSpeakNative', langCode)}
        </span>

        {voiceError && (
          <p className="mt-2 text-xs text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 font-medium max-w-md">
            {voiceError}
          </p>
        )}
      </div>

      {/* Input Options / Manual Input */}
      {q.input_type === 'single_choice' && q.options?.length > 0 && (
        <div className="w-full">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="h-px bg-gray-200 flex-1" />
            <span className="text-[11px] font-bold text-[#718078] uppercase tracking-wider">
              {getUIText('adaptive', 'orTapOption', langCode)}
            </span>
            <span className="h-px bg-gray-200 flex-1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-h-64 overflow-y-auto p-1">
            {q.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onSelectOption(opt.value, opt.label)}
                disabled={isSaving}
                className="p-3 sm:p-3.5 rounded-2xl bg-white hover:bg-[#134e40] text-[#134e40] hover:text-white border border-[#b8ded6] hover:border-[#134e40] text-xs sm:text-sm font-semibold text-left transition-all shadow-sm hover:shadow-md active:scale-98 flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  {opt.icon && <span className="text-base">{opt.icon}</span>}
                  <div>
                    <span className="block leading-snug">{opt.label}</span>
                    {opt.description && (
                      <span className="text-[10px] text-gray-500 group-hover:text-emerald-100 block">
                        {opt.description}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Multi-choice Options */}
      {q.input_type === 'multi_choice' && q.options?.length > 0 && (
        <div className="w-full">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="h-px bg-gray-200 flex-1" />
            <span className="text-[11px] font-bold text-[#718078] uppercase tracking-wider">
              {getUIText('adaptive', 'selectAllApply', langCode)}
            </span>
            <span className="h-px bg-gray-200 flex-1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-h-56 overflow-y-auto p-1 mb-4">
            {q.options.map((opt) => {
              const isSelected = selectedMultiOptions.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleToggleMulti(opt.value)}
                  className={`p-3 rounded-2xl text-xs sm:text-sm font-semibold text-left transition-all flex items-center justify-between border ${
                    isSelected
                      ? 'bg-[#134e40] text-white border-[#134e40] shadow'
                      : 'bg-white text-[#134e40] border-[#b8ded6] hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {opt.icon && <span>{opt.icon}</span>}
                    <span>{opt.label}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-emerald-300" />}
                </button>
              );
            })}
          </div>

          <button
            onClick={submitMultiChoice}
            disabled={selectedMultiOptions.length === 0 || isSaving}
            className="w-full py-3 rounded-full bg-[#134e40] text-white font-bold text-xs sm:text-sm shadow disabled:opacity-40 transition-all hover:bg-[#0d3b30]"
          >
            {getUIText('adaptive', 'continueSelected', langCode)} ({selectedMultiOptions.length})
          </button>
        </div>
      )}

      {/* Text / Voice Text Input */}
      {(q.input_type === 'text' || q.input_type === 'voice_text' || q.input_type === 'number') && (
        <div className="w-full max-w-md mb-4">
          <div className="flex items-center gap-2">
            <input
              type={q.input_type === 'number' ? 'number' : 'text'}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && textInput.trim()) {
                  onSubmitTextAnswer(textInput.trim());
                  setTextInput('');
                }
              }}
              placeholder={getUIText('adaptive', 'typeOrSpeakAnswer', langCode)}
              className="flex-1 px-4 py-3 rounded-2xl border border-[#b8ded6] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#134e40]/30"
            />
            <button
              onClick={() => {
                if (textInput.trim()) {
                  onSubmitTextAnswer(textInput.trim());
                  setTextInput('');
                }
              }}
              disabled={!textInput.trim() || isSaving}
              className="px-5 py-3 rounded-2xl bg-[#134e40] text-white font-bold text-sm hover:bg-[#0d3b30] disabled:opacity-40 shadow"
            >
              {getUIText('adaptive', 'submit', langCode)}
            </button>
          </div>
        </div>
      )}

      {/* Footer Navigation: Back & Stage Index */}
      <div className="w-full flex items-center justify-between mt-6 pt-4 border-t border-gray-100 text-xs text-[#718078]">
        {can_go_back && (
          <button onClick={onBack} className="flex items-center gap-1 hover:text-[#134e40] font-medium">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{getUIText('common', 'back', langCode)}</span>
          </button>
        )}
        <span className="font-semibold ml-auto">
          {getUIText('adaptive', 'stageLabel', langCode)} {stage_index + 1} {getUIText('adaptive', 'ofLabel', langCode)} {total_stages}
        </span>
      </div>

      {errorMessage && (
        <p className="mt-3 text-xs text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 font-medium">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
