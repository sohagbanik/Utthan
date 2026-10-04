import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, ArrowRight, ArrowLeft, CheckCircle2, Sparkles, RefreshCw, Globe, MapPin, UserRound, Check, Loader2 } from 'lucide-react';
import { speakWithSarvamAI, stopAIVoice, createSpeechRecognizer } from '../services/aiService';
import { isAudioRecordingSupported, AudioRecorder } from '../services/audioRecorder';
import { LANGUAGES } from '../data/languages';
import { getUIText, detectLanguageFromVoice, detectLocationFromVoice } from '../data/uiTranslations';
import { getStates, getDistrictsByState } from '../data/locations';
import {
  completeInterview,
  createOrResumeInterview,
  resolveLocation,
  updateInterview,
  transcribeAudio,
  fetchAdaptiveState,
  submitAdaptiveAnswer,
  correctStructuredProfileField,
  completeAdaptiveInterview,
  interpretVoiceTranscript,
} from '../services/api';
import AdaptiveInterviewView from '../components/AdaptiveInterviewView';
import {
  getInterviewResumeStep,
  hydrateInterviewAnswers,
  toInterviewResponses,
} from '../services/interviewPersistence';

function matchTranscriptToOption(transcript, options) {
  if (!transcript || !Array.isArray(options) || options.length === 0) return null;
  const clean = transcript.toLowerCase().trim();

  // 1. Direct equality
  const directMatch = options.find(opt => opt.toLowerCase().trim() === clean);
  if (directMatch) return directMatch;

  // 2. Direct equality without emojis
  const stripEmojis = (str) => str.replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, '').toLowerCase().trim();
  const cleanStripped = stripEmojis(transcript);

  const emojiStrippedMatch = options.find(opt => stripEmojis(opt) === cleanStripped);
  if (emojiStrippedMatch) return emojiStrippedMatch;

  // 3. Substring match (either contains the other)
  const substringMatch = options.find(opt => {
    const stripped = stripEmojis(opt);
    return cleanStripped.includes(stripped) || (stripped.length > 5 && stripped.includes(cleanStripped));
  });
  if (substringMatch) return substringMatch;

  // 4. Keyword token match
  const words = cleanStripped.split(/[\s,()/-]+/).filter(w => w.length >= 3);
  for (const opt of options) {
    const optWords = stripEmojis(opt).split(/[\s,()/-]+/).filter(w => w.length >= 3);
    for (const word of words) {
      if (optWords.some(ow => ow.includes(word) || word.includes(ow))) {
        return opt;
      }
    }
  }

  return null;
}

const INTERVIEW_STEPS = [
  {
    step: 1,
    category: "workInterest",
    badge: { en: "Step 1: Trade & Skills", hi: "चरण 1: पसंदीदा काम / हुनर", bn: "ধাপ ১: পছন্দের কাজ ও দক্ষতা" },
    question: {
      en: "What kind of work or trade are you most interested in learning?",
      hi: "आप किस प्रकार के काम या हुनर में सबसे ज्यादा रुचि रखते हैं?",
      bn: "আপনি কোন ধরনের কাজ বা হস্তশিল্প শিখতে সবচেয়ে বেশি আগ্রহী?",
      ta: "நீங்கள் எந்த வகையான வேலை அல்லது திறன்களைக் கற்றுக்கொள்ள விரும்புகிறீர்கள்?",
      te: "మీరు ఏ రకమైన పని లేదా నైపుణ్యాలను నేర్చుకోవడానికి ఆసక్తి కలిగి ఉన్నారు?",
      mr: "तुम्हाला कोणत्या प्रकारच्या कामात किंवा कौशल्यात सर्वात जास्त रस आहे?",
      gu: "તમને કયા પ્રકારના કામ અથવા કૌશલ્યમાં સૌથી વધુ રસ છે?",
      kn: "ನೀವು ಯಾವ ರೀತಿಯ ಕೆಲಸ ಅಥವಾ ಕೌಶಲ್ಯವನ್ನು ಕಲಿಯಲು ಆಸಕ್ತಿ ಹೊಂದಿದ್ದೀರಿ?",
      ml: "ഏതുതരം തൊഴിലോ നൈപുണ്യമോ പഠിക്കാനാണ് കൂടുതൽ താൽപ്പര്യം?",
      pa: "ਤੁਸੀਂ ਕਿਸ ਤਰ੍ਹਾਂ ਦੇ ਕੰਮ ਜਾਂ ਹੁਨਰ ਨੂੰ ਸਿੱਖਣ ਵਿੱਚ ਸਭ ਤੋਂ ਵੱਧ ਦਿਲਚਸਪੀ ਰੱਖਦੇ ਹੋ?",
      or: "ଆପଣ କେଉଁ ପ୍ରକାରର କାମ ବା ଦକ୍ଷତା ଶିଖିବାକୁ ଅଧିକ ଆଗ୍ରହୀ?",
      as: "আপুনি কি ধৰণৰ কাম বা দক্ষতা শিকিবলৈ আটাইতকৈ বেছি আগ্ৰহী?",
      ur: "آپ کس قسم کے کام یا ہنر کو سیکھنے میں سب سے زیادہ دلچسپی رکھتے ہیں؟"
    },
    options: {
      en: ["☀️ Solar & Electrical Maintenance", "🧵 Tailoring & Handloom Weaving", "🌾 Agri-Tech & Drone Farming", "🩺 Healthcare Assistant (GDA)", "🚗 Driving & Auto Mechanics"],
      hi: ["☀️ सोलर एवं इलेक्ट्रीशियन", "🧵 सिलाई एवं हथकरघा बुनाई", "🌾 आधुनिक कृषि एवं ड्रोन पायलट", "🩺 स्वास्थ्य सहायक (GDA)", "🚗 ड्राइविंग एवं मोटर मैकेनिक"],
      bn: ["☀️ সোলার প্যানেল ও ইলেকট্রিশিয়ান", "🧵 সেলাই ও তাঁতশিল্প", "🌾 আধুনিক কৃষি ও কিষাণ ড্রোন", "🩺 স্বাস্থ্য সহকারী (GDA)", "🚗 ড্রাইভিং ও অটোমোবাইল মেকানিক"]
    }
  },
  {
    step: 2,
    category: "education",
    badge: { en: "Step 2: Education & Experience", hi: "चरण 2: शिक्षा और अनुभव", bn: "ধাপ ২: শিক্ষাগত যোগ্যতা ও অভিজ্ঞতা" },
    question: {
      en: "What is your highest education level or existing experience?",
      hi: "आपकी उच्चतम शिक्षा क्या है या पहले से कोई अनुभव है?",
      bn: "আপনার শিক্ষাগত যোগ্যতা কত দূর বা কোনো পূর্ব অভিজ্ঞতা আছে কি?",
      ta: "உங்கள் கல்வித் தகுதி அல்லது முந்தைய அனுபவம் என்ன?",
      te: "మీ అత్యున్నత విద్య లేదా మునుపటి అనుభవం ఏమిటి?",
      mr: "तुमचे शिक्षण काय आहे किंवा पूर्वीचा काही अनुभव आहे का?",
      gu: "તમારું શિક્ષણ કેટલું છે અથવા અગાઉનો કોઈ અનુભવ છે?",
      kn: "ನಿಮ್ಮ ಶಿಕ್ಷಣ ಅಥವಾ ಹಿಂದಿನ ಅನುಭವವೇನು?",
      ml: "നിങ്ങളുടെ വിദ്യാഭ്യാസ യോഗ്യതയോ മുൻപരിചയമോ എന്താണ്?",
      pa: "ਤੁਹਾਡੀ ਪੜ੍ਹਾਈ ਜਾਂ ਪਿਛਲਾ ਤਜਰਬਾ ਕੀ ਹੈ?",
      or: "ଆପଣଙ୍କ ଶିକ୍ଷାଗତ ଯୋଗ୍ୟତା ବା ପୂର୍ବ ଅଭିଜ୍ଞତା କଣ?",
      as: "আপোনাৰ শিক্ষাগত অৰ্হতা বা পূৰ্ব অভিজ্ঞতা কি?",
      ur: "آپ کی تعلیمی قابلیت یا سابقہ تجربہ کیا ہے؟"
    },
    options: {
      en: ["🎓 10th Pass", "📚 12th Pass", "🏫 8th Pass or Below", "🛠️ ITI / Vocational Diploma", "🌱 No formal schooling (Eager to learn)"],
      hi: ["🎓 10वीं पास", "📚 12वीं पास", "🏫 8वीं पास या उससे कम", "🛠️ आईटीआई / वोकेशनल डिप्लोमा", "🌱 अनौपचारिक शिक्षा (सीखने के इच्छुक)"],
      bn: ["🎓 ১০ম শ্রেণী (মাধ্যমিক) পাস", "📚 ১২ম শ্রেণী (উচ্চমাধ্যমিক) পাস", "🏫 ৮ম শ্রেণী বা তার নিচে", "🛠️ আইটিআই বা ভোকেশনাল ডিপ্লোমা", "🌱 প্রাতিষ্ঠানিক পড়াশোনা নেই (শিখতে আগ্রহী)"]
    }
  },
  {
    step: 3,
    category: "mobility",
    badge: { en: "Step 3: Location & Travel", hi: "चरण 3: कार्यस्थल और दूरी", bn: "ধাপ ৩: কাজের স্থান ও যাতায়াত" },
    question: {
      en: "How far are you comfortable traveling daily for training or work?",
      hi: "ट्रेनिंग या काम के लिए आप रोज़ कितनी दूर तक जा सकते हैं?",
      bn: "প্রশিক্ষণ বা কাজের জন্য আপনি প্রতিদিন কত দূর পর্যন্ত যাতায়াত করতে পারবেন?",
      ta: "பயிற்சி அல்லது வேலைக்காக தினமும் எவ்வளவு தூரம் பயணிக்க முடியும்?",
      te: "శిక్షణ లేదా పని కోసం మీరు ప్రతిరోజూ ఎంత దూరం ప్రయాణించగలరు?",
      mr: "प्रशिक्षण किंवा कामासाठी तुम्ही रोज किती प्रवास करू शकता?",
      gu: "તાલીમ અથવા કામ માટે તમે દરરોજ કેટલા દૂર જઈ શકો છો?",
      kn: "ತರಬೇತಿ ಅಥವಾ ಕೆಲಸಕ್ಕಾಗಿ ಪ್ರತಿದಿನ ಎಷ್ಟು ದೂರ ಪ್ರಯಾಣಿಸಲು ಸಿದ್ಧರಿದ್ದೀರಿ?",
      ml: "പരിശീലനത്തിനോ ജോലിക്കോ ദിവസേന എത്ര ദൂരം യാത്ര ചെയ്യാൻ കഴിയും?",
      pa: "ਸਿਖਲਾਈ ਜਾਂ ਕੰਮ ਲਈ ਤੁਸੀਂ ਰੋਜ਼ਾਨਾ ਕਿੰਨੀ ਦੂਰ ਜਾ ਸਕਦੇ ਹੋ?",
      or: "ପ୍ରଶିକ୍ଷଣ ବା କାମ ପାଇଁ ଆପଣ ଦୈନିକ କେତେ ଦୂର ଯାତ୍ରା କରିପାରିବେ?",
      as: "প্ৰশিক্ষণ বা কামৰ বাবে আপুনি দৈনিক কিমান দূৰলৈ যাব পাৰিব?",
      ur: "تربیت یا کام کے لیے آپ روزانہ کتنی دور سفر کر سکتے ہیں؟"
    },
    options: {
      en: ["🏡 Within my own village / block", "🚲 Up to 15 km (Nearby Market / Town)", "🚌 Anywhere in my district", "🎒 Willing to relocate if hostel provided"],
      hi: ["🏡 अपने गाँव या ब्लॉक के अंदर", "🚲 15 किमी तक (नजदीकी कस्बा)", "🚌 अपने पूरे जिले में कहीं भी", "🎒 रहने की सुविधा हो तो बाहर जाने को तैयार"],
      bn: ["🏡 নিজের গ্রাম বা ব্লকের মধ্যে", "🚲 ১৫ কিমি পর্যন্ত (কাছের শহর)", "🚌 জেলার যেকোনো জায়গায়", "🎒 হোস্টেল ও থাকার ব্যবস্থা থাকলে বাইরে যেতে প্রস্তুত"]
    }
  },
  {
    step: 4,
    category: "preference",
    badge: { en: "Step 4: Your Goal", hi: "चरण 4: आपका मुख्य लक्ष्य", bn: "ধাপ ৪: আপনার মূল লক্ষ্য" },
    question: {
      en: "What is your main goal right now?",
      hi: "इस समय आपका सबसे मुख्य लक्ष्य क्या है?",
      bn: "এই মুহূর্তে আপনার প্রধান লক্ষ্য কোনটি?",
      ta: "தற்போது உங்கள் முதன்மை இலக்கு என்ன?",
      te: "ప్రస్తుతం మీ ముఖ్య లక్ష్యం ఏమిటి?",
      mr: "सध्या तुमचे मुख्य ध्येय काय आहे?",
      gu: "આ સમયે તમારો મુખ્ય ધ્યેય શું છે?",
      kn: "ಈ ಸಮಯದಲ್ಲಿ ನಿಮ್ಮ ಮುಖ್ಯ ಗುರಿ ಏನು?",
      ml: "ഇപ്പോൾ നിങ്ങളുടെ പ്രധാന ലക്ഷ്യം എന്താണ്?",
      pa: "ਇਸ ਵੇਲੇ ਤੁਹਾਡਾ ਮੁੱਖ ਟੀਚਾ ਕੀ ਹੈ?",
      or: "ବର୍ତ୍ତମାନ ଆପଣଙ୍କ ମୁଖ୍ୟ ଲକ୍ଷ୍ୟ କଣ?",
      as: "এই মুহূৰ্তত আপোনাৰ মূল লক্ষ্য কি?",
      ur: "اس وقت آپ کا بنیادی مقصد کیا ہے؟"
    },
    options: {
      en: ["📜 Certified Training + Monthly Stipend", "💼 Immediate Local Job Placement", "🏪 Start My Own Micro-Business / Shop"],
      hi: ["📜 प्रमाणित सरकारी ट्रेनिंग + मासिक वजीफा", "💼 नजदीकी क्षेत्र में तुरंत पक्की नौकरी", "🏪 अपनी खुद की दुकान या व्यवसाय शुरू करना"],
      bn: ["📜 সার্টিফিকেট প্রশিক্ষণ + মাসিক বৃত্তি (Stipend)", "💼 এলাকায় দ্রুত চাকরির সুযোগ", "🏪 নিজের ছোট দোকান বা স্বনির্ভর ব্যবসা শুরু করা"]
    }
  }
];

export default function ConversationPage({ 
  currentLanguage, 
  onSelectLanguage,
  onCompleteConversation,
  onLocationResolved,
  beneficiarySession,
  userProfile,
  initialResolvedLocation,
  onEnsureBeneficiary,
  onInvalidSession,
  persistenceError,
  isPersisting = false,
}) {
  // 0 = Language, 1 = Name, 2 = Automatic Location, 3-6 = Interview, 7 = Complete
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [nameInput, setNameInput] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [locationError, setLocationError] = useState('');
  const [locationMode, setLocationMode] = useState('auto'); // 'auto' | 'manual'
  const [manualStateId, setManualStateId] = useState('');
  const [manualDistrictId, setManualDistrictId] = useState('');
  const [locationVoiceFeedback, setLocationVoiceFeedback] = useState('');

  const allStates = React.useMemo(() => {
    return [...getStates()].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const availableDistricts = React.useMemo(() => {
    if (!manualStateId) return [];
    return [...getDistrictsByState(manualStateId)].sort((a, b) => a.name.localeCompare(b.name));
  }, [manualStateId]);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [voiceState, setVoiceState] = useState('idle'); // 'idle' | 'recording' | 'transcribing' | 'error'
  const [voiceError, setVoiceError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [interviewSession, setInterviewSession] = useState(null);
  const [isInterviewLoading, setIsInterviewLoading] = useState(false);
  const [isInterviewSaving, setIsInterviewSaving] = useState(false);
  const [interviewError, setInterviewError] = useState('');
  const [adaptiveState, setAdaptiveState] = useState(null);
  const [clarificationPrompt, setClarificationPrompt] = useState('');
  // Track last spoken step to prevent re-speaking on re-renders or language updates
  const lastSpokenStepRef = useRef(-1);
  const lastSpokenQuestionIdRef = useRef('');
  const hasSpokenGreetingRef = useRef(false);
  const activeRecognizer = useRef(null);
  const audioRecorderRef = useRef(null);
  const locationAttemptedRef = useRef(false);
  const interviewLoadKeyRef = useRef('');

  const langCode = currentLanguage?.id || 'en';
  const isLanguageStep = currentStepIndex === 0;
  const isNameStep = currentStepIndex === 1;
  const isLocationStep = currentStepIndex === 2;
  const isCompleteStep = currentStepIndex > INTERVIEW_STEPS.length + 2;
  const currentInterviewStep = !isLanguageStep && !isNameStep && !isLocationStep && !isCompleteStep
    ? INTERVIEW_STEPS[currentStepIndex - 3]
    : null;
  const spokenQuestion = currentInterviewStep?.question?.[langCode]
    || currentInterviewStep?.question?.hi
    || currentInterviewStep?.question?.en
    || '';

  const applyInterviewSession = useCallback((session) => {
    const restoredAnswers = hydrateInterviewAnswers(session, {
      name: userProfile?.fullName,
      location: initialResolvedLocation,
    });
    const resumeStep = getInterviewResumeStep(session, INTERVIEW_STEPS.length);

    setInterviewSession(session);
    setAnswers(restoredAnswers);
    setNameInput(userProfile?.fullName || '');
    setResolvedLocation(initialResolvedLocation || null);
    setCurrentStepIndex(resumeStep);

    if (session?.id && beneficiarySession?.sessionToken) {
      fetchAdaptiveState(session.id, beneficiarySession.sessionToken)
        .then((state) => setAdaptiveState(state))
        .catch(() => {});
    }
  }, [beneficiarySession?.sessionToken, initialResolvedLocation, userProfile?.fullName]);

  const loadOrResumeInterview = useCallback(async (session = beneficiarySession, language = langCode) => {
    if (!session) return null;
    const loadKey = session.beneficiaryId;
    if (interviewLoadKeyRef.current === loadKey && interviewSession) return interviewSession;

    interviewLoadKeyRef.current = loadKey;
    setIsInterviewLoading(true);
    setInterviewError('');
    try {
      const loaded = await createOrResumeInterview(
        session.beneficiaryId,
        session.sessionToken,
        language,
      );
      applyInterviewSession(loaded);
      return loaded;
    } catch (error) {
      interviewLoadKeyRef.current = '';
      if (error?.status === 401 || error?.status === 403) {
        if (onInvalidSession) onInvalidSession();
      } else {
        setInterviewError('Your interview could not be restored right now. Please try again.');
      }
      return null;
    } finally {
      setIsInterviewLoading(false);
    }
  }, [applyInterviewSession, beneficiarySession, interviewSession, langCode, onInvalidSession]);

  useEffect(() => {
    if (beneficiarySession) loadOrResumeInterview(beneficiarySession, langCode);
  }, [beneficiarySession, langCode, loadOrResumeInterview]);

  useEffect(() => {
    if (!beneficiarySession) return;
    if (userProfile?.fullName) {
      setNameInput(userProfile.fullName);
      setAnswers(previous => ({ ...previous, name: userProfile.fullName }));
    }
    if (initialResolvedLocation) {
      setResolvedLocation(initialResolvedLocation);
      setAnswers(previous => ({ ...previous, location: initialResolvedLocation }));
    }
  }, [beneficiarySession, userProfile?.fullName, initialResolvedLocation]);

  // Speak when step changes to a new step
  useEffect(() => {
    if (!soundEnabled || isCompleteStep) return;

    const activeAdaptiveQ = adaptiveState?.current_question;
    const isAdaptiveQuestionNew = activeAdaptiveQ && lastSpokenQuestionIdRef.current !== activeAdaptiveQ.question_id;

    // Prevent speaking the same step again on re-render
    if (lastSpokenStepRef.current === currentStepIndex && !isAdaptiveQuestionNew) return;

    let textToSpeak = "";
    let speechLang = langCode;

    if (isLanguageStep) {
      if (hasSpokenGreetingRef.current) return;
      hasSpokenGreetingRef.current = true;
      textToSpeak = "Welcome to Utthan. Please speak or select your language to begin.";
      speechLang = 'en';
    } else if (isNameStep) {
      textToSpeak = getUIText('conversation', 'step1SpeakPrompt', langCode);
    } else if (isLocationStep) {
      textToSpeak = getUIText('conversation', 'step2SpeakPrompt', langCode);
    } else if (activeAdaptiveQ?.question_text) {
      textToSpeak = activeAdaptiveQ.question_text;
      lastSpokenQuestionIdRef.current = activeAdaptiveQ.question_id;
    } else if (spokenQuestion) {
      textToSpeak = spokenQuestion;
    }

    if (textToSpeak) {
      lastSpokenStepRef.current = currentStepIndex;
      stopAIVoice();
      setIsSpeaking(true);
      speakWithSarvamAI({
        text: textToSpeak,
        languageId: speechLang,
        speaker: 'priya'
      }).finally(() => {
        setIsSpeaking(false);
      });
    }

    return () => {
      stopAIVoice();
    };
  }, [currentStepIndex, soundEnabled, isLanguageStep, isNameStep, isLocationStep, spokenQuestion, isCompleteStep, langCode, adaptiveState?.current_question?.question_id]);

  // Handle language confirmation (voice or tap)
  const handleConfirmLanguage = (lang) => {
    stopAIVoice();
    if (activeRecognizer.current) {
      try { activeRecognizer.current.stop(); } catch (e) {}
    }
    setIsListening(false);
    setLiveTranscript('');

    if (onSelectLanguage) {
      onSelectLanguage(lang);
    }

    setResolvedLocation(null);
    setLocationStatus('idle');
    setLocationError('');
    setNameInput('');
    setManualStateId('');
    setManualDistrictId('');
    setLocationVoiceFeedback('');
    setLocationMode('auto');
    locationAttemptedRef.current = false;

    // Confirmation voice in that exact language
    const confirmationVoice = lang.id === 'bn' 
      ? "বাংলা ভাষা নির্বাচন করা হয়েছে। এবার আপনার পছন্দের কাজ সম্পর্কে জানা যাক।" 
      : lang.id === 'hi' 
        ? "हिन्दी भाषा चुनी गई है। चलिए अब आपके पसंदीदा काम के बारे में जानते हैं।" 
        : `${lang.name} language selected. Let's explore your skills.`;

    if (soundEnabled) {
      setIsSpeaking(true);
      speakWithSarvamAI({ text: confirmationVoice, languageId: lang.id, speaker: 'priya' })
        .finally(() => {
          setIsSpeaking(false);
          // Advance to Step 1 only after confirmation voice finishes
          setTimeout(() => setCurrentStepIndex(1), 300);
        });
    } else {
      setCurrentStepIndex(1);
    }
  };

  const continueFromName = () => {
    const name = nameInput.trim();
    if (!name) return;
    setAnswers((previous) => ({ ...previous, name }));
    setCurrentStepIndex(2);
  };

  const requestAutomaticLocation = () => {
    if (locationStatus === 'detecting') return;

    locationAttemptedRef.current = true;
    setLocationStatus('detecting');
    setLocationError('');
    setLocationVoiceFeedback('');

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('This browser does not support automatic location. Please select your State and District manually below.');
      setLocationMode('manual');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const location = await resolveLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          setResolvedLocation(location);
          setAnswers((previous) => ({ ...previous, location }));
          if (location?.state?.id) setManualStateId(location.state.id);
          if (location?.district?.id) setManualDistrictId(location.district.id);
          setLocationStatus('success');
          if (onLocationResolved) onLocationResolved(location);
        } catch {
          setLocationStatus('error');
          setLocationError(getUIText('conversation', 'locationErrorDefault', langCode));
        }
      },
      (error) => {
        const messages = {
          1: 'Location permission was not granted. You can select your State and District manually below.',
          2: 'Your device could not determine a location. You can select your State and District manually below.',
          3: 'Location detection took too long. You can select your State and District manually below.',
        };
        setLocationStatus('error');
        setLocationError(messages[error.code] || 'Location is temporarily unavailable. You can select your State and District manually below.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
    );
  };

  const handleSelectManualState = (stateId) => {
    setManualStateId(stateId);
    setManualDistrictId('');
    setLocationVoiceFeedback('');
    if (resolvedLocation) {
      setResolvedLocation(null);
      setAnswers((previous) => ({ ...previous, location: null }));
    }
  };

  const handleSelectManualDistrict = (districtId) => {
    setManualDistrictId(districtId);
    setLocationVoiceFeedback('');
    const stateObj = allStates.find((s) => s.id === manualStateId);
    const distObj = availableDistricts.find((d) => d.id === districtId);
    if (stateObj && distObj) {
      const canonicalLoc = {
        state: {
          id: stateObj.id,
          code: stateObj.code,
          name: stateObj.name,
          type: stateObj.type,
          lgd_code: stateObj.lgdCode,
        },
        district: {
          id: distObj.id,
          code: distObj.code,
          name: distObj.name,
          state_id: distObj.stateId,
          lgd_district_code: distObj.lgdDistrictCode,
        },
      };
      setResolvedLocation(canonicalLoc);
      setAnswers((previous) => ({ ...previous, location: canonicalLoc }));
      setLocationStatus('success');
      if (onLocationResolved) onLocationResolved(canonicalLoc);
    }
  };

  const handleLocationVoiceTranscript = (transcript) => {
    const allDistricts = allStates.flatMap((s) => getDistrictsByState(s.id));
    const detected = detectLocationFromVoice(transcript, allStates, allDistricts);
    if (detected?.state && detected?.district) {
      setManualStateId(detected.state.id);
      setManualDistrictId(detected.district.id);
      const canonicalLoc = {
        state: {
          id: detected.state.id,
          code: detected.state.code,
          name: detected.state.name,
          type: detected.state.type,
          lgd_code: detected.state.lgdCode,
        },
        district: {
          id: detected.district.id,
          code: detected.district.code,
          name: detected.district.name,
          state_id: detected.district.stateId,
          lgd_district_code: detected.district.lgdDistrictCode,
        },
      };
      setResolvedLocation(canonicalLoc);
      setAnswers((previous) => ({ ...previous, location: canonicalLoc }));
      setLocationStatus('success');
      setLocationMode('manual');
      setLocationVoiceFeedback(`✓ ${detected.district.name}, ${detected.state.name}`);
      if (onLocationResolved) onLocationResolved(canonicalLoc);
    } else if (detected?.district) {
      const stateObj = allStates.find((s) => s.id === detected.district.stateId);
      if (stateObj) {
        setManualStateId(stateObj.id);
        setManualDistrictId(detected.district.id);
        const canonicalLoc = {
          state: {
            id: stateObj.id,
            code: stateObj.code,
            name: stateObj.name,
            type: stateObj.type,
            lgd_code: stateObj.lgdCode,
          },
          district: {
            id: detected.district.id,
            code: detected.district.code,
            name: detected.district.name,
            state_id: detected.district.stateId,
            lgd_district_code: detected.district.lgdDistrictCode,
          },
        };
        setResolvedLocation(canonicalLoc);
        setAnswers((previous) => ({ ...previous, location: canonicalLoc }));
        setLocationStatus('success');
        setLocationMode('manual');
        setLocationVoiceFeedback(`✓ ${detected.district.name}, ${stateObj.name}`);
        if (onLocationResolved) onLocationResolved(canonicalLoc);
      }
    } else if (detected?.state) {
      setManualStateId(detected.state.id);
      setLocationMode('manual');
      setLocationVoiceFeedback(`✓ State: ${detected.state.name}. Please select your district.`);
    } else {
      setLocationVoiceFeedback(`Heard: "${transcript}". Please select your State and District below.`);
    }
  };

  const continueFromLocation = async () => {
    if (!resolvedLocation || isPersisting || isInterviewLoading) return;

    const currentName = nameInput.trim() || userProfile?.fullName?.trim() || answers?.name || 'Beneficiary';

    let activeSession = interviewSession;
    if (!beneficiarySession && onEnsureBeneficiary) {
      try {
        const session = await onEnsureBeneficiary({
          name: currentName,
          languageId: currentLanguage.id,
          resolvedLocation,
        });
        if (session && !session.isLocal) {
          try {
            activeSession = await loadOrResumeInterview(session, langCode);
          } catch (err) {
            console.warn('Could not initialize remote interview session:', err);
          }
        }
      } catch (err) {
        console.warn('Could not ensure beneficiary profile, continuing locally:', err);
      }
    } else if (!interviewSession && beneficiarySession && !beneficiarySession.isLocal) {
      try {
        activeSession = await loadOrResumeInterview(beneficiarySession, langCode);
      } catch (err) {
        console.warn('Could not resume remote interview session:', err);
      }
    }

    setAnswers(previous => ({
      ...previous,
      name: currentName,
      location: resolvedLocation,
    }));
    setCurrentStepIndex(3);

    // Initial adaptive interview state load if backend available
    if (activeSession?.id && beneficiarySession?.sessionToken && !beneficiarySession.isLocal) {
      try {
        const state = await fetchAdaptiveState(activeSession.id, beneficiarySession.sessionToken);
        if (state) setAdaptiveState(state);
      } catch (err) {
        console.warn('Could not load adaptive interview state, continuing with built-in interview:', err);
      }
    }
  };

  // Adaptive interview answer submission
  const handleSelectAdaptiveOption = async (normalizedVal, rawVal) => {
    if (!interviewSession || !beneficiarySession || isInterviewSaving) return;
    stopAIVoice();
    if (activeRecognizer.current) {
      try { activeRecognizer.current.stop(); } catch {}
    }
    setIsListening(false);
    setLiveTranscript('');
    setClarificationPrompt('');
    setIsInterviewSaving(true);
    setInterviewError('');

    try {
      const qId = adaptiveState?.current_question?.question_id || 'general';
      const updated = await submitAdaptiveAnswer(
        interviewSession.id,
        beneficiarySession.sessionToken,
        {
          question_id: qId,
          raw_answer: typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal),
          normalized_answer: normalizedVal,
          input_method: 'option',
          language: langCode,
        }
      );
      setAdaptiveState(updated);
      if (updated.profile_summary) {
        setAnswers(prev => ({
          ...prev,
          workInterest: updated.profile_summary.interested_sector_name || prev.workInterest,
          education: updated.profile_summary.education_label || prev.education,
          mobility: updated.profile_summary.mobility_preference || prev.mobility,
          preference: updated.profile_summary.primary_goal || prev.preference,
        }));
      }

      if (updated.is_completed) {
        setCurrentStepIndex(INTERVIEW_STEPS.length + 3);
      }
    } catch (err) {
      setInterviewError(err?.message || 'Failed to submit answer. Please try again.');
    } finally {
      setIsInterviewSaving(false);
    }
  };

  const handleAdaptiveVoiceAnswer = async (transcript) => {
    if (!adaptiveState?.current_question || !interviewSession || !beneficiarySession) return;
    const currentQ = adaptiveState.current_question;
    let matchedVal = null;
    let matchedLabel = null;

    if (currentQ.options && currentQ.options.length > 0) {
      const labels = currentQ.options.map(o => o.label);
      const matchedLabelOpt = matchTranscriptToOption(transcript, labels);
      if (matchedLabelOpt) {
        const found = currentQ.options.find(o => o.label === matchedLabelOpt);
        if (found) {
          matchedVal = found.value;
          matchedLabel = found.label;
        }
      }
    }

    if (matchedVal) {
      // Deterministic fast-path when exact option matched
      await handleSelectAdaptiveOption(matchedVal, matchedLabel);
    } else {
      // Conversational Groq Interpretation Layer
      setIsInterviewSaving(true);
      setInterviewError('');
      try {
        const res = await interpretVoiceTranscript(
          interviewSession.id,
          beneficiarySession.sessionToken,
          transcript,
          langCode,
          currentQ.question_id,
        );

        // Check if clarification is needed (e.g. ambiguity or missing specifics)
        if (res.clarification_needed && res.clarification_question) {
          setInterviewError('');
          setClarificationPrompt(res.clarification_question);
          if (soundEnabled) {
            setIsSpeaking(true);
            speakWithSarvamAI({
              text: res.clarification_question,
              languageId: langCode,
              speaker: 'priya',
            }).finally(() => setIsSpeaking(false));
          }
          return;
        }

        // Check if contradiction was detected
        if (res.contradiction_detected && res.contradiction_message) {
          setInterviewError('');
          setClarificationPrompt(res.contradiction_message);
          if (soundEnabled) {
            setIsSpeaking(true);
            speakWithSarvamAI({
              text: res.contradiction_message,
              languageId: langCode,
              speaker: 'priya',
            }).finally(() => setIsSpeaking(false));
          }
          return;
        }

        setClarificationPrompt('');
        if (res.updated_state) {
          setAdaptiveState(res.updated_state);
          if (res.updated_state.profile_summary) {
            setAnswers(prev => ({
              ...prev,
              workInterest: res.updated_state.profile_summary.interested_sector_name || prev.workInterest,
              education: res.updated_state.profile_summary.education_label || prev.education,
              mobility: res.updated_state.profile_summary.mobility_preference || prev.mobility,
              preference: res.updated_state.profile_summary.primary_goal || prev.preference,
            }));
          }
          if (res.updated_state.is_completed) {
            setCurrentStepIndex(INTERVIEW_STEPS.length + 3);
          }
        }
      } catch (err) {
        setInterviewError(err?.message || 'Failed to interpret speech. Please try again or select an option.');
      } finally {
        setIsInterviewSaving(false);
      }
    }
  };

  const handleCorrectProfileField = async (fieldName, value) => {
    if (!interviewSession || !beneficiarySession) return;
    setIsInterviewSaving(true);
    try {
      const updatedProfile = await correctStructuredProfileField(
        interviewSession.id,
        beneficiarySession.sessionToken,
        fieldName,
        value,
      );
      setAdaptiveState(prev => prev ? ({ ...prev, profile_summary: updatedProfile }) : prev);
    } catch (err) {
      setInterviewError('Failed to update field.');
    } finally {
      setIsInterviewSaving(false);
    }
  };

  const handleCompleteAdaptiveInterview = async () => {
    if (!interviewSession || !beneficiarySession || isInterviewSaving) return;
    setIsInterviewSaving(true);
    setInterviewError('');
    try {
      const finalState = await completeAdaptiveInterview(
        interviewSession.id,
        beneficiarySession.sessionToken,
      );
      setAdaptiveState(finalState);
      setCurrentStepIndex(INTERVIEW_STEPS.length + 3);
      if (onCompleteConversation) {
        onCompleteConversation({
          ...answers,
          ...finalState.profile_summary,
        });
      }
    } catch (err) {
      setInterviewError('Could not complete interview. Please try again.');
    } finally {
      setIsInterviewSaving(false);
    }
  };

  // Handle answering interview steps (legacy fallback)
  const handleSelectAnswer = async (selectedText) => {
    if (!currentInterviewStep || isInterviewSaving || isInterviewLoading) return;
    stopAIVoice();
    if (activeRecognizer.current) {
      try { activeRecognizer.current.stop(); } catch (e) {}
    }
    setIsListening(false);
    setLiveTranscript('');

    const newAnswers = { ...answers, [currentInterviewStep.category]: selectedText };
    setAnswers(newAnswers);

    // If local/client fallback mode, advance smoothly without server blocking
    if (!interviewSession || !beneficiarySession || beneficiarySession.isLocal) {
      if (currentStepIndex < INTERVIEW_STEPS.length + 2) {
        setCurrentStepIndex(prev => prev + 1);
      } else {
        setCurrentStepIndex(INTERVIEW_STEPS.length + 3);
        const completionVoice = langCode === 'bn'
          ? "অভিনন্দন! আপনার তথ্যের ভিত্তিতে আমরা আপনার জেলার ৫টি সেরা সরকারি সুযোগ খুঁজে পেয়েছি।"
          : langCode === 'hi'
            ? "बधाई हो! आपकी जानकारी के आधार पर हमने आपके जिले में सबसे उपयुक्त 5 सरकारी योजनाएं तैयार कर ली हैं।"
            : "Congratulations! Based on your answers, we have matched 5 certified government schemes in your district.";

        if (soundEnabled) {
          setIsSpeaking(true);
          speakWithSarvamAI({ text: completionVoice, languageId: langCode, speaker: 'priya' })
            .finally(() => setIsSpeaking(false));
        }
      }
      return;
    }

    const interviewResponses = toInterviewResponses(newAnswers);
    setIsInterviewSaving(true);
    setInterviewError('');
    try {
      const saved = await updateInterview(
        interviewSession.id,
        beneficiarySession.sessionToken,
        interviewResponses,
        interviewSession.revision,
      );
      setInterviewSession(saved);
      setAnswers(previous => ({ ...previous, ...saved.responses }));

      if (currentStepIndex < INTERVIEW_STEPS.length + 2) {
        // Advance to next step directly; useEffect will cleanly speak the new question
        setCurrentStepIndex(prev => prev + 1);
      } else {
        // Complete after the final answer is saved as a draft.
        setCurrentStepIndex(INTERVIEW_STEPS.length + 3);
        const completionVoice = langCode === 'bn'
          ? "অভিনন্দন! আপনার তথ্যের ভিত্তিতে আমরা আপনার জেলার ৫টি সেরা সরকারি সুযোগ খুঁজে পেয়েছি।"
          : langCode === 'hi'
            ? "बधाई हो! आपकी जानकारी के आधार पर हमने आपके जिले में सबसे उपयुक्त 5 सरकारी योजनाएं तैयार कर ली हैं।"
            : "Congratulations! Based on your answers, we have matched 5 certified government schemes in your district.";

        if (soundEnabled) {
          setIsSpeaking(true);
          speakWithSarvamAI({ text: completionVoice, languageId: langCode, speaker: 'priya' })
            .finally(() => setIsSpeaking(false));
        }
      }
    } catch (error) {
      console.warn('Could not save interview answer to backend, proceeding locally:', error);
      if (currentStepIndex < INTERVIEW_STEPS.length + 2) {
        setCurrentStepIndex(prev => prev + 1);
      } else {
        setCurrentStepIndex(INTERVIEW_STEPS.length + 3);
      }
    } finally {
      setIsInterviewSaving(false);
    }
  };

  const handleCompleteInterview = async () => {
    if (isInterviewSaving) return;
    if (!interviewSession || !beneficiarySession || beneficiarySession.isLocal) {
      if (onCompleteConversation) {
        onCompleteConversation(answers);
      }
      return;
    }
    if (interviewSession.status === 'completed') {
      if (onCompleteConversation) {
        onCompleteConversation(answers);
      }
      return;
    }

    setIsInterviewSaving(true);
    setInterviewError('');
    try {
      const completed = await completeInterview(
        interviewSession.id,
        beneficiarySession.sessionToken,
        interviewSession.revision,
      );
      setInterviewSession(completed);
      setAnswers(previous => ({ ...previous, ...completed.responses }));
      if (onCompleteConversation) {
        onCompleteConversation({ ...answers, ...completed.responses });
      }
    } catch (error) {
      console.warn('Could not mark interview completed on backend, navigating locally:', error);
      if (onCompleteConversation) {
        onCompleteConversation(answers);
      }
    } finally {
      setIsInterviewSaving(false);
    }
  };

  // Reset voice state on step switch
  useEffect(() => {
    setVoiceError('');
    setLiveTranscript('');
    if (audioRecorderRef.current) {
      audioRecorderRef.current.cancel();
      audioRecorderRef.current = null;
    }
    if (activeRecognizer.current) {
      try { activeRecognizer.current.stop(); } catch {}
      activeRecognizer.current = null;
    }
    setIsListening(false);
    setVoiceState('idle');
  }, [currentStepIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRecorderRef.current) {
        audioRecorderRef.current.cancel();
        audioRecorderRef.current = null;
      }
      if (activeRecognizer.current) {
        try { activeRecognizer.current.stop(); } catch {}
        activeRecognizer.current = null;
      }
    };
  }, []);

  // Voice recording via backend Sarvam STT with browser SpeechRecognition fallback
  const startVoiceInput = async () => {
    stopAIVoice();
    setVoiceError('');
    setLiveTranscript('');

    // Primary Path: MediaRecorder -> Backend Sarvam STT
    if (isAudioRecordingSupported()) {
      try {
        const recorder = new AudioRecorder({
          maxDurationMs: 25000,
          onMaxDurationReached: () => {
            stopVoiceInput();
          },
        });
        await recorder.start();
        audioRecorderRef.current = recorder;
        setIsListening(true);
        setVoiceState('recording');
        return;
      } catch (err) {
        if (err.message === 'PERMISSION_DENIED') {
          setVoiceError('Microphone permission was not granted. Please allow microphone access in your browser settings.');
          setVoiceState('error');
          setIsListening(false);
          return;
        } else if (err.message === 'DEVICE_NOT_FOUND') {
          setVoiceError('No microphone detected on your device.');
          setVoiceState('error');
          setIsListening(false);
          return;
        }
        // Other errors fall through to browser recognizer fallback
      }
    }

    // Fallback Path: Browser Web Speech API
    const recognizer = createSpeechRecognizer({
      languageId: isLanguageStep ? 'en' : langCode,
      onResult: (transcript, isFinal) => {
        setLiveTranscript(transcript);

        if (isLanguageStep) {
          const detected = detectLanguageFromVoice(transcript, LANGUAGES);
          if (detected) {
            setIsListening(false);
            setVoiceState('idle');
            handleConfirmLanguage(detected);
          }
        } else if (isNameStep) {
          if (transcript.trim()) {
            setNameInput(transcript.trim());
          }
        } else if (isLocationStep) {
          if (isFinal && transcript.trim()) {
            setIsListening(false);
            setVoiceState('idle');
            handleLocationVoiceTranscript(transcript.trim());
          }
        } else {
          const currentOptions = currentInterviewStep
            ? (currentInterviewStep.options[langCode] || currentInterviewStep.options.hi || currentInterviewStep.options.en)
            : [];
          const matched = matchTranscriptToOption(transcript, currentOptions);
          if (isFinal && matched) {
            setIsListening(false);
            setVoiceState('idle');
            handleSelectAnswer(matched);
          }
        }
      },
      onError: (err) => {
        console.warn("Speech fallback error:", err);
        setIsListening(false);
        setVoiceState('idle');
      },
      onEnd: () => {
        setIsListening(false);
        setVoiceState('idle');
      }
    });

    if (recognizer) {
      try {
        recognizer.start();
        setIsListening(true);
        setVoiceState('recording');
        activeRecognizer.current = recognizer;
      } catch {
        setIsListening(false);
        setVoiceState('idle');
      }
    } else {
      setIsListening(false);
      setVoiceState('idle');
      setVoiceError('Voice input is not supported in this browser. Please tap an option below.');
    }
  };

  const stopVoiceInput = async () => {
    // 1. Primary Path: Process audio recorded by MediaRecorder via Sarvam STT
    if (audioRecorderRef.current) {
      const recorder = audioRecorderRef.current;
      audioRecorderRef.current = null;
      setIsListening(false);
      setVoiceState('transcribing');

      try {
        const audioResult = await recorder.stop();
        if (!audioResult?.blob || audioResult.blob.size === 0) {
          setVoiceState('idle');
          return;
        }

        const languageHint = isLanguageStep ? 'unknown' : langCode;
        const result = await transcribeAudio(
          audioResult.blob,
          languageHint,
          beneficiarySession?.sessionToken,
        );

        const transcript = result?.transcript?.trim();
        setVoiceState('idle');

        if (!transcript) {
          setVoiceError('We could not detect clear speech. Please try speaking again.');
          return;
        }

        setLiveTranscript(transcript);

        if (isLanguageStep) {
          const detected = detectLanguageFromVoice(transcript, LANGUAGES);
          if (detected) {
            handleConfirmLanguage(detected);
          } else {
            setVoiceError(`Heard: "${transcript}". Please tap your preferred language.`);
          }
        } else if (isNameStep) {
          setNameInput(transcript);
        } else if (isLocationStep) {
          handleLocationVoiceTranscript(transcript);
        } else if (adaptiveState && !isLanguageStep && !isNameStep && !isLocationStep) {
          handleAdaptiveVoiceAnswer(transcript);
        } else if (currentInterviewStep) {
          const currentOptions = currentInterviewStep.options[langCode]
            || currentInterviewStep.options.hi
            || currentInterviewStep.options.en
            || [];
          const matched = matchTranscriptToOption(transcript, currentOptions);
          if (matched) {
            handleSelectAnswer(matched);
          } else {
            setVoiceError(`Recognized: "${transcript}". Please tap the closest matching option below.`);
          }
        }
      } catch (err) {
        setVoiceState('error');
        setVoiceError(err?.message || 'Voice recognition is temporarily unavailable. Please tap an option.');
      }
      return;
    }

    // 2. Fallback Path: Browser Web Speech API
    if (activeRecognizer.current) {
      try { activeRecognizer.current.stop(); } catch {}
      activeRecognizer.current = null;
    }
    setIsListening(false);
    setVoiceState('idle');

    if (liveTranscript.trim()) {
      if (isLanguageStep) {
        const detected = detectLanguageFromVoice(liveTranscript, LANGUAGES);
        if (detected) {
          handleConfirmLanguage(detected);
        }
      } else if (isNameStep) {
        setNameInput(liveTranscript.trim());
      } else if (isLocationStep) {
        handleLocationVoiceTranscript(liveTranscript.trim());
      } else if (adaptiveState && !isLanguageStep && !isNameStep && !isLocationStep) {
        handleAdaptiveVoiceAnswer(liveTranscript.trim());
      } else if (currentInterviewStep) {
        const currentOptions = currentInterviewStep.options[langCode]
          || currentInterviewStep.options.hi
          || currentInterviewStep.options.en
          || [];
        const matched = matchTranscriptToOption(liveTranscript, currentOptions);
        if (matched) {
          handleSelectAnswer(matched);
        }
      }
    }
  };

  const handleReplayQuestion = () => {
    if (isSpeaking) {
      // Toggle off if currently speaking
      stopAIVoice();
      setIsSpeaking(false);
      return;
    }

    let text = "";
    let speechLang = langCode;
    if (isLanguageStep) {
      text = "Welcome to Utthan. Please speak or select your language to begin.";
      speechLang = 'en';
    } else if (isNameStep) {
      text = "Please tell us your name, or type it below.";
    } else if (isLocationStep) {
      text = "We need your location to find opportunities and training available near you.";
    } else if (adaptiveState?.current_question?.question_text) {
      text = adaptiveState.current_question.question_text;
    } else if (currentInterviewStep) {
      text = currentInterviewStep.question[langCode] || currentInterviewStep.question.hi || currentInterviewStep.question.en;
    }

    if (text) {
      stopAIVoice();
      setIsSpeaking(true);
      speakWithSarvamAI({ text, languageId: speechLang, speaker: 'priya' }).finally(() => {
        setIsSpeaking(false);
      });
    }
  };

  return (
    <div className="relative z-20 flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 min-h-[calc(100vh-140px)]">
      
      {/* ============================================================ */}
      {/* 1. STEP 0: AI TAKES INPUT OF PREFERRED LANGUAGE BY VOICE/TAP */}
      {/* ============================================================ */}
      {isLanguageStep && (
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border-2 border-[#134e40]/30 shadow-xl text-center max-w-xl w-full animate-in fade-in duration-300">
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#134e40] bg-[#FAF7F0] px-3.5 py-1.5 rounded-full border border-[#b8ded6]">
              <Globe className="w-3.5 h-3.5 text-[#134e40]" />
              <span>Step 0: Choose / Speak Language</span>
            </div>

            <button
              onClick={handleReplayQuestion}
              className={`p-2 rounded-full border border-[#b8ded6] hover:bg-[#FAF7F0] text-[#134e40] transition-colors ${
                isSpeaking ? 'bg-emerald-100 animate-pulse ring-2 ring-emerald-400' : 'bg-white'
              }`}
              title="Re-listen voice greeting"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>

          <h2 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[#134e40] mb-2">
            {getUIText('conversation', 'step0Title', langCode)}
          </h2>
          <p className="text-xs sm:text-sm text-[#37474F] mb-6">
            {getUIText('conversation', 'step0Subtitle', langCode)}
          </p>

          {/* Central Voice Button for Language */}
          <div className="mb-6 flex flex-col items-center">
            <button
              onClick={isListening ? stopVoiceInput : startVoiceInput}
              disabled={voiceState === 'transcribing'}
              className={`relative group w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95 focus:outline-none ${
                isListening 
                  ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-300' 
                  : voiceState === 'transcribing'
                    ? 'bg-amber-600 text-white animate-pulse ring-4 ring-amber-200'
                    : 'bg-[#134e40] text-white hover:bg-[#0d3b30] hover:scale-105'
              }`}
              title={isListening ? "Tap to finish & transcribe" : getUIText('conversation', 'step0SpeakHint', langCode)}
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
                ? "Transcribing your voice (Sarvam AI)..."
                : isListening 
                  ? (liveTranscript ? `Hearing: "${liveTranscript}"...` : "Listening... Tap mic when finished speaking.")
                  : isSpeaking 
                    ? "Speaking greeting aloud (Sarvam AI)..."
                    : getUIText('conversation', 'step0SpeakHint', langCode)}
            </span>

            {voiceError && (
              <p className="mt-2 text-xs text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 font-medium max-w-sm">
                {voiceError}
              </p>
            )}
          </div>

          {/* 22 Language Cards Grid */}
          <div className="text-left w-full">
            <span className="text-[11px] font-bold text-[#718078] uppercase tracking-wider block mb-2 text-center">
              {getUIText('conversation', 'step0TapSelect', langCode)}
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => handleConfirmLanguage(l)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                    currentLanguage?.id === l.id 
                      ? 'bg-white border-[#134e40] ring-2 ring-[#134e40]/20 font-bold' 
                      : 'bg-white/80 hover:bg-[#134e40] hover:text-white border-[#cbd5e1] text-[#263238]'
                  }`}
                >
                  <span className="text-sm">{l.nativeName}</span>
                  <span className="text-[10px] text-gray-400">{l.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. NAME STEP                                                  */}
      {/* ============================================================ */}
      {isNameStep && (
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-[#b8ded6] shadow-xl max-w-xl w-full text-center animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#134e40] bg-[#FAF7F0] px-3.5 py-1.5 rounded-full border border-[#b8ded6]">
              <UserRound className="w-3.5 h-3.5 text-[#134e40]" />
              <span>{getUIText('conversation', 'step1Badge', langCode)}</span>
            </div>
            <button
              onClick={handleReplayQuestion}
              className={`p-2 rounded-full border border-[#b8ded6] hover:bg-[#FAF7F0] text-[#134e40] transition-colors ${
                isSpeaking ? 'bg-emerald-100 animate-pulse ring-2 ring-emerald-400' : 'bg-white'
              }`}
              title="Re-listen name question"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>

          <h2 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[#134e40] mb-3">
            {getUIText('conversation', 'step1Title', langCode)}
          </h2>
          <p className="text-sm text-[#37474F] mb-6">{getUIText('conversation', 'step1Subtitle', langCode)}</p>
          <div className="relative mb-5">
            <input
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') continueFromName();
              }}
              placeholder={getUIText('conversation', 'step1Placeholder', langCode)}
              aria-label="Your name"
              className="w-full pl-4 pr-12 py-3.5 rounded-2xl border border-[#b8ded6] bg-white text-[#263238] focus:outline-none focus:ring-2 focus:ring-[#134e40]/30"
            />
            <button
              type="button"
              onClick={isListening ? stopVoiceInput : startVoiceInput}
              disabled={voiceState === 'transcribing'}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
                isListening
                  ? 'bg-red-600 text-white animate-pulse'
                  : voiceState === 'transcribing'
                    ? 'bg-amber-600 text-white animate-pulse'
                    : 'bg-[#FAF7F0] text-[#134e40] hover:bg-[#134e40] hover:text-white border border-[#b8ded6]'
              }`}
              title={isListening ? "Tap to finish speaking" : "Speak your name"}
            >
              {voiceState === 'transcribing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          </div>
          {isListening && (
            <p className="text-xs text-red-600 font-semibold mb-3 animate-pulse">
              {getUIText('conversation', 'step1Listening', langCode)}
            </p>
          )}
          {voiceState === 'transcribing' && (
            <p className="text-xs text-amber-700 font-semibold mb-3 animate-pulse">
              {getUIText('conversation', 'step1Transcribing', langCode)}
            </p>
          )}
          {voiceError && (
            <p className="text-xs text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 font-medium mb-3">
              {voiceError}
            </p>
          )}
          <div className="w-full flex items-center justify-between pt-4 border-t border-gray-100 text-xs text-[#718078]">
            <button
              onClick={() => setCurrentStepIndex(0)}
              className="flex items-center gap-1 hover:text-[#134e40] font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{getUIText('conversation', 'back', langCode)}</span>
            </button>
            <button
              onClick={continueFromName}
              disabled={!nameInput.trim()}
              className="flex items-center gap-1 hover:text-[#134e40] disabled:opacity-40 font-bold"
            >
              <span>{getUIText('conversation', 'continue', langCode)}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. LOCATION STEP: GPS OR MANUAL STATE & DISTRICT SELECTION   */}
      {/* ============================================================ */}
      {isLocationStep && (
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-[#b8ded6] shadow-xl max-w-xl w-full text-center animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#134e40] bg-[#FAF7F0] px-3.5 py-1.5 rounded-full border border-[#b8ded6]">
              <MapPin className="w-3.5 h-3.5 text-[#134e40]" />
              <span>{getUIText('conversation', 'step2Badge', langCode)}</span>
            </div>
            <button
              onClick={handleReplayQuestion}
              className={`p-2 rounded-full border border-[#b8ded6] hover:bg-[#FAF7F0] text-[#134e40] transition-colors ${
                isSpeaking ? 'bg-emerald-100 animate-pulse ring-2 ring-emerald-400' : 'bg-white'
              }`}
              title="Re-listen location explanation"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>

          <h2 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[#134e40] mb-3">
            {getUIText('conversation', 'step2Title', langCode)}
          </h2>
          <p className="text-sm text-[#37474F] mb-5">
            {getUIText('conversation', 'step2Subtitle', langCode)}
          </p>

          {/* Option Mode Toggle: GPS or Manual */}
          <div className="flex p-1 bg-[#FAF7F0] rounded-2xl border border-[#b8ded6] mb-5">
            <button
              type="button"
              onClick={() => setLocationMode('auto')}
              className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                locationMode === 'auto'
                  ? 'bg-[#134e40] text-white shadow-sm'
                  : 'text-[#134e40] hover:bg-white/80'
              }`}
            >
              <span>{getUIText('conversation', 'autoLocationTab', langCode)}</span>
            </button>
            <button
              type="button"
              onClick={() => setLocationMode('manual')}
              className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                locationMode === 'manual'
                  ? 'bg-[#134e40] text-white shadow-sm'
                  : 'text-[#134e40] hover:bg-white/80'
              }`}
            >
              <span>{getUIText('conversation', 'manualLocationTab', langCode)}</span>
            </button>
          </div>

          {/* Location Success Banner if resolved */}
          {resolvedLocation && (
            <div className="p-4 rounded-2xl bg-[#DCECDF]/60 border border-[#b8ded6] text-left mb-5 animate-in fade-in">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm mb-1">
                <CheckCircle2 className="w-5 h-5" />
                <span>{getUIText('conversation', 'locationDetected', langCode)}</span>
              </div>
              <p className="text-base font-bold text-[#134e40]">
                {resolvedLocation.district.name}, {resolvedLocation.state.name}
              </p>
              <p className="text-xs text-[#718078] mt-1">{getUIText('conversation', 'locationDetectedDesc', langCode)}</p>
            </div>
          )}

          {/* MODE 1: AUTOMATIC GPS */}
          {locationMode === 'auto' && !resolvedLocation && (
            <div className="space-y-4">
              <button
                onClick={requestAutomaticLocation}
                disabled={locationStatus === 'detecting'}
                className="w-full px-5 py-3.5 rounded-full bg-[#134e40] hover:bg-[#0d3b30] disabled:opacity-60 text-white font-bold text-sm shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <MapPin className="w-5 h-5" />
                <span>
                  {locationStatus === 'detecting'
                    ? getUIText('conversation', 'detectingLocation', langCode)
                    : getUIText('conversation', 'allowLocation', langCode)}
                </span>
              </button>

              {locationStatus === 'error' && (
                <div className="p-3.5 rounded-xl bg-[#FFF8EE] border border-[#FAD7AB] text-left">
                  <p className="text-xs text-[#7a3b0e] mb-3">
                    {locationError || getUIText('conversation', 'locationErrorDefault', langCode)}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={requestAutomaticLocation}
                      className="text-xs font-bold text-[#134e40] hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> {getUIText('conversation', 'tryAgain', langCode)}
                    </button>
                    <button
                      onClick={() => setLocationMode('manual')}
                      className="text-xs font-bold text-[#e69943] hover:underline"
                    >
                      ✍️ {getUIText('conversation', 'orSelectManually', langCode)} →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: MANUAL SELECTION VIA DROPDOWN OR MICROPHONE */}
          {locationMode === 'manual' && (
            <div className="space-y-4 text-left">
              {/* Voice Input for State / District */}
              <div className="p-3 rounded-2xl bg-[#FAF7F0] border border-[#b8ded6] flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[11px] font-bold text-[#134e40] block">
                    🎙️ {getUIText('conversation', 'speakLocationPrompt', langCode)}
                  </span>
                  <span className="text-[10px] text-[#718078]">
                    {isListening
                      ? getUIText('conversation', 'listeningLocation', langCode)
                      : voiceState === 'transcribing'
                        ? getUIText('conversation', 'transcribingLocation', langCode)
                        : (locationVoiceFeedback || "Tap mic and speak your location")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={isListening ? stopVoiceInput : startVoiceInput}
                  disabled={voiceState === 'transcribing'}
                  className={`p-2.5 rounded-xl transition-all ${
                    isListening
                      ? 'bg-red-600 text-white animate-pulse'
                      : voiceState === 'transcribing'
                        ? 'bg-amber-600 text-white animate-pulse'
                        : 'bg-[#134e40] text-white hover:bg-[#0d3b30] shadow'
                  }`}
                  title="Speak State or District"
                >
                  {voiceState === 'transcribing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* State Dropdown */}
              <div>
                <label className="block text-xs font-bold text-[#134e40] mb-1.5">
                  {getUIText('conversation', 'stateLabel', langCode)}
                </label>
                <select
                  value={manualStateId}
                  onChange={(e) => handleSelectManualState(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#b8ded6] bg-white text-xs sm:text-sm text-[#263238] focus:outline-none focus:ring-2 focus:ring-[#134e40]/30"
                >
                  <option value="">{getUIText('conversation', 'selectState', langCode)}</option>
                  {allStates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* District Dropdown */}
              <div>
                <label className="block text-xs font-bold text-[#134e40] mb-1.5">
                  {getUIText('conversation', 'districtLabel', langCode)}
                </label>
                <select
                  value={manualDistrictId}
                  onChange={(e) => handleSelectManualDistrict(e.target.value)}
                  disabled={!manualStateId}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#b8ded6] bg-white text-xs sm:text-sm text-[#263238] focus:outline-none focus:ring-2 focus:ring-[#134e40]/30 disabled:opacity-50"
                >
                  <option value="">
                    {manualStateId
                      ? getUIText('conversation', 'selectDistrict', langCode)
                      : getUIText('conversation', 'selectStateFirst', langCode)}
                  </option>
                  {availableDistricts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="w-full flex items-center justify-between mt-6 pt-4 border-t border-gray-100 text-xs text-[#718078]">
            <button
              onClick={() => {
                stopAIVoice();
                setCurrentStepIndex(1);
              }}
              className="flex items-center gap-1 hover:text-[#134e40] font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{getUIText('conversation', 'back', langCode)}</span>
            </button>
            <button
              onClick={continueFromLocation}
              disabled={!resolvedLocation || isPersisting}
              className="flex items-center gap-1 hover:text-[#134e40] disabled:opacity-40 font-bold"
            >
              <span>{isPersisting ? getUIText('conversation', 'saving', langCode) : getUIText('conversation', 'continue', langCode)}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {persistenceError && (
            <p className="mt-3 text-xs text-[#7a3b0e] bg-amber-50 border border-amber-200 rounded-lg p-2 text-center" role="alert">
              {persistenceError}
            </p>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. ADAPTIVE BENEFICIARY INTERVIEW + STRUCTURED PROFILE     */}
      {/* ============================================================ */}
      {!isLanguageStep && !isNameStep && !isLocationStep && !isCompleteStep && (
        adaptiveState ? (
          <AdaptiveInterviewView
            adaptiveState={adaptiveState}
            onSelectOption={handleSelectAdaptiveOption}
            onSubmitTextAnswer={(text) => handleSelectAdaptiveOption(text, text)}
            onCorrectField={handleCorrectProfileField}
            onCompleteInterview={handleCompleteAdaptiveInterview}
            onBack={() => {
              // allow back where safely possible
            }}
            isListening={isListening}
            voiceState={voiceState}
            voiceError={voiceError}
            liveTranscript={liveTranscript}
            onStartVoice={startVoiceInput}
            onStopVoice={stopVoiceInput}
            soundEnabled={soundEnabled}
            onToggleSound={() => {
              if (soundEnabled) stopAIVoice();
              setSoundEnabled(!soundEnabled);
            }}
            onReplayQuestion={handleReplayQuestion}
            isSpeaking={isSpeaking}
            isSaving={isInterviewSaving}
            errorMessage={interviewError}
            clarificationMessage={clarificationPrompt}
            langCode={langCode}
          />
        ) : currentInterviewStep ? (
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-[#b8ded6] shadow-xl max-w-2xl w-full flex flex-col items-center text-center transition-all animate-in fade-in duration-300">
            {/* Top Step Pill & Voice Controls */}
            <div className="w-full flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#134e40] bg-[#FAF7F0] px-3.5 py-1.5 rounded-full border border-[#b8ded6]">
                <Sparkles className="w-3.5 h-3.5 text-[#e69943]" />
                <span>{currentInterviewStep.badge[langCode] || currentInterviewStep.badge.hi || currentInterviewStep.badge.en}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (soundEnabled) stopAIVoice();
                    setSoundEnabled(!soundEnabled);
                  }}
                  className={`p-2 rounded-full border transition-colors ${
                    soundEnabled ? 'bg-[#134e40] text-white border-[#134e40]' : 'bg-white text-[#718078] border-[#cbd5e1]'
                  }`}
                  title={soundEnabled ? "Audio ON" : "Audio Muted"}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                <button
                  onClick={handleReplayQuestion}
                  className={`p-2 rounded-full border border-[#b8ded6] hover:bg-[#FAF7F0] text-[#134e40] transition-colors ${
                    isSpeaking ? 'bg-emerald-100 animate-pulse ring-2 ring-emerald-400' : 'bg-white'
                  }`}
                  title="Re-listen question"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-6 border border-[#b8ded6]/40">
              <div 
                className="bg-[#134e40] h-full transition-all duration-500 rounded-full"
                style={{ width: `${((currentStepIndex - 1) / (INTERVIEW_STEPS.length + 2)) * 100}%` }}
              />
            </div>

            {/* Question Heading in Preferred Language */}
            <h2 className="font-serif-heading text-2xl sm:text-3xl md:text-4xl font-bold text-[#134e40] leading-snug mb-6 max-w-xl">
              {currentInterviewStep.question[langCode] || currentInterviewStep.question.hi || currentInterviewStep.question.en}
            </h2>

            {/* Center Voice Mic Button */}
            <div className="mb-6 flex flex-col items-center">
              <button
                onClick={isListening ? stopVoiceInput : startVoiceInput}
                disabled={voiceState === 'transcribing'}
                className={`relative group w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95 focus:outline-none ${
                  isListening 
                    ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-300' 
                    : voiceState === 'transcribing'
                      ? 'bg-amber-600 text-white animate-pulse ring-4 ring-amber-200'
                      : 'bg-[#134e40] text-white hover:bg-[#0d3b30] hover:scale-105'
                }`}
                title={isListening ? "Tap to finish & transcribe" : "Tap to Speak your answer"}
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
                  ? "Transcribing your answer (Sarvam AI)..."
                  : isListening 
                    ? (liveTranscript ? `"${liveTranscript}"` : `Listening in ${currentLanguage.nativeName}... Tap mic when finished`)
                    : isSpeaking 
                      ? "Speaking question aloud (Sarvam AI)..."
                      : "Tap to Speak your answer"}
              </span>

              {voiceError && (
                <p className="mt-2 text-xs text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 font-medium max-w-md">
                  {voiceError}
                </p>
              )}
            </div>

            {/* Option Cards */}
            <div className="w-full">
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="h-px bg-gray-200 flex-1" />
                <span className="text-[11px] font-bold text-[#718078] uppercase tracking-wider">
                  {getUIText('conversation', 'orTapOption', langCode)}
                </span>
                <span className="h-px bg-gray-200 flex-1" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {(currentInterviewStep.options[langCode] || currentInterviewStep.options.hi || currentInterviewStep.options.en).map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectAnswer(opt)}
                    disabled={isInterviewSaving || isInterviewLoading}
                    className="p-3 sm:p-3.5 rounded-2xl bg-white hover:bg-[#134e40] text-[#134e40] hover:text-white border border-[#b8ded6] hover:border-[#134e40] text-xs sm:text-sm font-semibold text-left transition-all shadow-sm hover:shadow-md active:scale-98 flex items-center justify-between group"
                  >
                    <span>{opt}</span>
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Back Button */}
            <div className="w-full flex items-center justify-between mt-6 pt-4 border-t border-gray-100 text-xs text-[#718078]">
              <button
                onClick={() => {
                  stopAIVoice();
                  setCurrentStepIndex(prev => Math.max(3, prev - 1));
                }}
                className="flex items-center gap-1 hover:text-[#134e40] font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{getUIText('conversation', 'back', langCode)}</span>
              </button>
              <span className="font-semibold">
                {langCode === 'bn' 
                  ? `ধাপ ${currentStepIndex - 1} / ${INTERVIEW_STEPS.length + 2}` 
                  : langCode === 'hi'
                    ? `चरण ${currentStepIndex - 1} / ${INTERVIEW_STEPS.length + 2}`
                    : `Step ${currentStepIndex - 1} of ${INTERVIEW_STEPS.length + 2}`}
              </span>
            </div>

          </div>
        ) : null
      )}


      {/* ============================================================ */}
      {/* 3. COMPLETION SCREEN: SUMMARY & MATCHED SCHEMES             */}
      {/* ============================================================ */}
      {isCompleteStep && (
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 border-2 border-[#134e40]/30 shadow-xl text-center max-w-xl w-full animate-in fade-in zoom-in-95 duration-400">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#134e40] flex items-center justify-center mx-auto mb-4 border border-emerald-300 shadow-sm">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <h2 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[#134e40] mb-2">
            {getUIText('conversation', 'summaryTitle', langCode)}
          </h2>

          <p className="text-sm sm:text-base text-[#37474F] mb-6">
            {getUIText('conversation', 'summarySubtitle', langCode)}
          </p>

          {/* User Answers Summary */}
          <div className="bg-[#FAF7F0] rounded-2xl p-4 border border-[#b8ded6] mb-6 text-left space-y-2 text-xs sm:text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[#718078]">{getUIText('conversation', 'summaryLanguage', langCode)}</span>
              <span className="font-bold text-[#134e40]">{currentLanguage.nativeName} ({currentLanguage.name})</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#718078]">{getUIText('conversation', 'summaryTrade', langCode)}</span>
              <span className="font-bold text-[#134e40]">{answers.workInterest || "Selected"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#718078]">{getUIText('conversation', 'summaryEducation', langCode)}</span>
              <span className="font-bold text-[#134e40]">{answers.education || "Selected"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#718078]">{getUIText('conversation', 'summaryName', langCode)}</span>
              <span className="font-bold text-[#134e40]">{answers.name || "Not provided"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#718078]">{getUIText('conversation', 'summaryLocation', langCode)}</span>
              <span className="font-bold text-[#134e40]">
                {answers.location ? `${answers.location.district.name}, ${answers.location.state.name}` : "Not detected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#718078]">{getUIText('conversation', 'summaryTravel', langCode)}</span>
              <span className="font-bold text-[#134e40]">{answers.mobility || "Selected"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#718078]">{getUIText('conversation', 'summaryGoal', langCode)}</span>
              <span className="font-bold text-[#134e40]">{answers.preference || "Selected"}</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleCompleteInterview}
              disabled={isPersisting || isInterviewSaving}
              className="px-6 py-3.5 rounded-full bg-[#134e40] hover:bg-[#0d3b30] disabled:opacity-60 text-white font-bold text-sm sm:text-base shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span>{isPersisting || isInterviewSaving ? getUIText('conversation', 'savingInterview', langCode) : getUIText('conversation', 'viewMatchedOpps', langCode)}</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                stopAIVoice();
                setCurrentStepIndex(0);
                setAnswers({});
                setNameInput('');
                setResolvedLocation(null);
                setLocationStatus('idle');
                setLocationError('');
                setManualStateId('');
                setManualDistrictId('');
                setLocationVoiceFeedback('');
                setLocationMode('auto');
                locationAttemptedRef.current = false;
              }}
              className="px-5 py-3 rounded-full border border-[#cbd5e1] hover:bg-white text-[#718078] font-medium text-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{getUIText('conversation', 'startOver', langCode)}</span>
            </button>
          </div>

          {(persistenceError || interviewError) && (
            <p className="mt-4 text-xs font-semibold text-[#7a3b0e]" role="alert">
              {persistenceError || interviewError}
            </p>
          )}
        </div>
      )}

    </div>
  );
}
