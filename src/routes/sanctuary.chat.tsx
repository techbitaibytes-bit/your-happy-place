import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { Send, Loader2, Plus, Clock, Volume2, Square, X } from "lucide-react";
import jsPDF from "jspdf";
import { TopBar } from "@/components/TopBar";
import { GlassCard } from "@/components/GlassCard";
import { GlowButton } from "@/components/GlowButton";
import { ModeChips } from "@/components/ModeChips";
import { MoodLogger } from "@/components/MoodLogger";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { MODES, getMode, type ModeId } from "@/lib/modes";
import { useLocalStorage, STORAGE_KEYS, type ChatMessage, type MoodEntry, type UserData, type ChatSession } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sanctuary/chat")({
  head: () => ({
    meta: [
      { title: "Chat — EmpathAI Sanctuary" },
      { name: "description", content: "Warm, private AI chat with six gentle support modes — listener, coach, CBT guide, friend, therapist-style, reflective. Built for teens." },
      { property: "og:title", content: "Chat — EmpathAI Sanctuary" },
      { property: "og:description", content: "Private AI chat companion with multiple support modes for teens and young adults." },
      { property: "og:url", content: "https://friendlypal.lovable.app/sanctuary/chat" },
    ],
    links: [{ rel: "canonical", href: "https://friendlypal.lovable.app/sanctuary/chat" }],
  }),
  component: ChatPage,
});

const REACTION_EMOJIS = ["💜", "🥺", "💡", "🌟", "🤗"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

type VoicePersonaId = "ara" | "eve" | "nova" | "sage";

type VoicePersonalityId = "therapist" | "storytime" | "meditation" | "motivation";

const VOICE_PERSONAS = [
  {
    id: "ara" as const,
    name: "Ara",
    emoji: "🎵",
    description: "Upbeat & warm",
    prefer: [
      "Samantha",
      "Karen",
      "Moira",
      "Victoria",
      "Google US English",
      "Microsoft Zira",
      "female",
      "en-US",
    ],
    pitch: 1.1,
    rate: 0.95,
  },
  {
    id: "eve" as const,
    name: "Eve",
    emoji: "🌊",
    description: "Soothing & calm",
    prefer: [
      "Tessa",
      "Fiona",
      "Veena",
      "Google UK English Female",
      "Microsoft Hazel",
      "en-GB",
    ],
    pitch: 0.9,
    rate: 0.82,
  },
  {
    id: "nova" as const,
    name: "Nova",
    emoji: "⚡",
    description: "Energetic & bright",
    prefer: [
      "Google US English",
      "Samantha",
      "Microsoft Zira",
      "en-AU",
      "en-US",
    ],
    pitch: 1.2,
    rate: 1.05,
  },
  {
    id: "sage" as const,
    name: "Sage",
    emoji: "🧘",
    description: "Deep & meditative",
    prefer: [
      "Daniel",
      "Alex",
      "Fred",
      "Google UK English Male",
      "Microsoft David",
      "en-GB",
      "en-US",
    ],
    pitch: 0.8,
    rate: 0.78,
  },
] as const;

const VOICE_PERSONALITIES = [
  {
    id: "therapist" as const,
    name: "Therapist",
    icon: "🪷",
    description: "Calm & measured",
    pitchMod: 0,
    rateMod: -0.05,
  },
  {
    id: "storytime" as const,
    name: "Storytime",
    icon: "📖",
    description: "Warm & expressive",
    pitchMod: 0.1,
    rateMod: 0,
  },
  {
    id: "meditation" as const,
    name: "Meditation",
    icon: "🧘",
    description: "Slow & peaceful",
    pitchMod: -0.1,
    rateMod: -0.15,
  },
  {
    id: "motivation" as const,
    name: "Motivation",
    icon: "⚡",
    description: "Energetic & uplifting",
    pitchMod: 0.15,
    rateMod: 0.1,
  },
] as const;

function resolveVoice(persona: typeof VOICE_PERSONAS[number], voices: SpeechSynthesisVoice[]) {
  if (voices.length === 0) return null;

  for (const pref of persona.prefer) {
    const match = voices.find(
      (v) => v.name.toLowerCase().includes(pref.toLowerCase()) || v.lang.toLowerCase().includes(pref.toLowerCase()),
    );
    if (match) return match;
  }

  const englishVoices = voices.filter((v) => v.lang.startsWith("en"));
  if (englishVoices.length > 0) {
    const idx = VOICE_PERSONAS.findIndex((p) => p.id === persona.id);
    return englishVoices[idx % englishVoices.length];
  }

  return voices[0];
}

function ChatPage() {
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(STORAGE_KEYS.chat, []);
  const [modeId, setModeId] = useLocalStorage<ModeId>(STORAGE_KEYS.mode, "listener");
  const [moods] = useLocalStorage<MoodEntry[]>(STORAGE_KEYS.moods, []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // New features
  const [onboarded, setOnboarded] = useLocalStorage<boolean>(STORAGE_KEYS.onboarded, false);
  const [user, setUser] = useLocalStorage<UserData | null>(STORAGE_KEYS.user, null);
  const [showOnboarding, setShowOnboarding] = useState(!onboarded);
  const [history, setHistory] = useLocalStorage<ChatSession[]>(STORAGE_KEYS.history, []);
  const [showHistory, setShowHistory] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceEnabledRef = useRef(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<VoicePersonaId>("ara");
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<VoicePersonalityId>("therapist");
  const [neuroMode, setNeuroMode] = useLocalStorage<boolean>(STORAGE_KEYS.neuroMode, false);
  const [simpleLanguageMode, setSimpleLanguageMode] = useLocalStorage<boolean>(STORAGE_KEYS.simpleLanguageMode, false);
  const [highContrastMode, setHighContrastMode] = useLocalStorage<boolean>(STORAGE_KEYS.highContrastMode, false);
  const [textSize, setTextSize] = useLocalStorage<string>(STORAGE_KEYS.textSize, "medium");
  const [showSettings, setShowSettings] = useState(false);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("neuro-mode", neuroMode);
    document.documentElement.classList.toggle("high-contrast", highContrastMode);
    const sizeMap: Record<string, string> = {
      small: "15px",
      medium: "16px",
      large: "17px",
      xlarge: "18px",
    };
    document.documentElement.style.setProperty("--base-font-size", sizeMap[textSize] ?? "16px");
  }, [neuroMode, highContrastMode, textSize]);

  const PLACEHOLDERS = [
    "What's on your mind?",
    "Tell me anything.",
    "No judgment here.",
    "How are you, really?",
    "You can start anywhere.",
  ];
  const [phIdx, setPhIdx] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSimpleMode(simpleLanguageMode);
  }, [simpleLanguageMode]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setPhIdx((p) => (p + 1) % PLACEHOLDERS.length), 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!onboarded || showOnboarding || messages.length > 0) return;

    const userRaw = typeof window !== "undefined" ? window.localStorage.getItem("empathai.user.v1") : null;
    let parsedUser: UserData | null = null;
    try {
      parsedUser = userRaw ? (JSON.parse(userRaw) as UserData) : null;
    } catch {
      parsedUser = null;
    }

    const name = parsedUser?.name ?? "";
    const reason = parsedUser?.reason ?? "";
    const greeting = name
      ? `Welcome back, ${name} 💜 How are you feeling today? Last time you mentioned ${reason || "you wanted to talk"} — I'm here whenever you're ready.`
      : "Welcome back 💜 How are you feeling today? I'm here for you.";

    const welcomeMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: greeting,
      ts: Date.now(),
    };
    setMessages([welcomeMsg]);
  }, [onboarded, showOnboarding, messages.length, setMessages]);

  const startNewConversation = () => {
    if (messages.length > 0) {
      const firstUser = messages.find((m) => m.role === "user")?.content || messages[0]?.content || "New conversation";
      const title = `${firstUser.substring(0, 40)}${firstUser.length > 40 ? "..." : ""}`;
      const session: ChatSession = {
        id: crypto.randomUUID(),
        title,
        ts: Date.now(),
        messages,
        modeId,
      };
      setHistory([session, ...history].slice(0, 20));
    }
    setMessages([]);
    setInput("");
  };

  const loadSession = (session: ChatSession) => {
    setMessages(session.messages);
    setModeId(session.modeId as ModeId);
    setShowHistory(false);
  };

  const quickStartPrompts: Record<ModeId, string[]> = {
    listener: ["I'm feeling overwhelmed", "I had a rough day", "I don't know where to start", "I just need someone to listen"],
    coach: ["Help me take one small step", "I'm stuck on a problem", "I need motivation", "Help me make a plan"],
    cbt: ["I keep thinking the worst", "I feel like a failure", "My thoughts are spiraling", "Help me reframe this"],
    friend: ["I just want to vent", "Something happened today", "I need a friend right now", "Can we just talk?"],
    therapist: ["I've been feeling this way for a while", "I want to understand myself better", "Something from my past is bothering me", "Why do I keep doing this?"],
    reflective: ["Help me journal about today", "What does this feeling mean?", "I want to make sense of things", "Help me reflect"],
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed, ts: Date.now() };
      const assistantId = crypto.randomUUID();
      const placeholder: ChatMessage = { id: assistantId, role: "assistant", content: "", ts: Date.now() };
      const next = [...messages, userMsg, placeholder];
      setMessages(next);
      setInput("");
      setStreaming(true);
      setError(null);

      const recentMood = moods[0]
        ? `${moods[0].emoji} ${moods[0].label} (${moods[0].intensity}/10)${moods[0].note ? ` — "${moods[0].note}"` : ""}`
        : undefined;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            preset: "chat",
            modeId,
            neuroMode,
            simpleLanguage: simpleMode || simpleLanguageMode,
            messages: next
              .filter((m) => m.id !== assistantId)
              .map(({ role, content }) => ({ role, content })),
            recentMood,
            userName: user?.name,
          }),
        });

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "");
          throw new Error(body || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)));
        }

        if (voiceEnabledRef.current) {
          setMessages((prev) => {
            const lastMsg = prev.find((m) => m.id === assistantId);
            if (lastMsg?.content) {
              speakText(lastMsg.content);
            }
            return prev;
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setStreaming(false);
        inputRef.current?.focus();
      }
    },
    [messages, modeId, moods, user, setMessages, streaming],
  );

  const stopSpeech = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
  }, []);

  const speakText = useCallback(
    (text: string) => {
      if (!text?.trim()) return;

      window.speechSynthesis.cancel();

      const clean = text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/#{1,6}\s*/g, "")
        .replace(/[💜✨🌙💡🌟🤗🥺🎵🌊⚡🧘🪷📖]/g, "")
        .replace(/\n+/g, ". ")
        .trim();

      if (!clean) return;

      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(clean);
        const persona = VOICE_PERSONAS.find((p) => p.id === selectedPersonaId) ?? VOICE_PERSONAS[0];
        const personality = VOICE_PERSONALITIES.find((p) => p.id === selectedPersonalityId) ?? VOICE_PERSONALITIES[0];

        if (availableVoices.length > 0) {
          let matched: SpeechSynthesisVoice | null = null;
          for (const pref of persona.prefer) {
            matched =
              availableVoices.find(
                (v) =>
                  v.name.toLowerCase().includes(pref.toLowerCase()) ||
                  v.lang.toLowerCase().startsWith(pref.toLowerCase()),
              ) ?? null;
            if (matched) break;
          }
          if (!matched) {
            matched = availableVoices.find((v) => v.lang.startsWith("en")) ?? availableVoices[0];
          }
          if (matched) utterance.voice = matched;
        }

        utterance.pitch = Math.max(0.5, Math.min(2, persona.pitch + personality.pitchMod));
        utterance.rate = Math.max(0.3, Math.min(2, persona.rate + personality.rateMod));
        utterance.volume = 1;

        utterance.onerror = (e) => {
          console.warn("Speech error:", e);
        };

        window.speechSynthesis.speak(utterance);
      }, 100);
    },
    [availableVoices, selectedPersonaId, selectedPersonalityId],
  );

  const enableVoice = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const primer = new SpeechSynthesisUtterance("\u200B");
    primer.volume = 0;
    window.speechSynthesis.speak(primer);
    voiceEnabledRef.current = true;
    setVoiceMode(true);
  }, []);

  const toggleVoiceMode = useCallback(() => {
    if (!voiceMode) {
      enableVoice();
      return;
    }

    voiceEnabledRef.current = false;
    if (typeof window !== "undefined") window.speechSynthesis.cancel();
    stopSpeech();
    setVoiceMode(false);
  }, [enableVoice, stopSpeech, voiceMode]);

  useEffect(() => {
    voiceEnabledRef.current = voiceMode;
  }, [voiceMode]);

  const addReaction = useCallback((messageId: string, emoji: ReactionEmoji) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              reactions: {
                ...m.reactions,
                [emoji]: (m.reactions?.[emoji] ?? 0) + 1,
              },
            }
          : m,
      ),
    );
  }, [setMessages]);

  const send = useCallback(() => sendMessage(input), [input, sendMessage]);

  const exportPdf = useCallback(() => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 48;
    let y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("EmpathAI Conversation", margin, y);
    y += 24;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Exported: ${new Date().toLocaleString()}`, margin, y);
    y += 14;
    doc.text(`Mode: ${getMode(modeId).label}`, margin, y);
    y += 20;

    messages.forEach((m) => {
      if (y > 720) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(m.role === "user" ? 40 : 80);
      doc.text(m.role === "user" ? "You" : "EmpathAI", margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30);
      const lines = doc.splitTextToSize(m.content, 500);
      lines.forEach((ln: string) => {
        if (y > 740) {
          doc.addPage();
          y = margin;
        }
        doc.text(ln, margin, y);
        y += 14;
      });
      y += 10;
    });

    // Footer
    if (y > 700) {
      doc.addPage();
      y = margin;
    }
    y += 20;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text("EmpathAI — Not a substitute for professional mental health care.", margin, y);
    doc.text("If you are in crisis, call 988 (US) or visit findahelpline.com", margin, y + 12);
    doc.save(`empathai-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [messages, modeId]);

  return (
    <>
      <AnimatedBackground />
      <OnboardingModal
        open={showOnboarding}
        onComplete={(name, reason) => {
          setUser({ name, reason });
          setOnboarded(true);
          setShowOnboarding(false);
        }}
      />
      <TopBar
        onExport={messages.length ? exportPdf : undefined}
        voiceEnabled={voiceMode}
        onToggleVoice={toggleVoiceMode}
        onToggleNeuro={() => setNeuroMode((current) => !current)}
        onOpenSettings={() => setShowSettings(true)}
        neuroMode={neuroMode}
        simpleLanguageMode={simpleMode || simpleLanguageMode}
      />

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 px-4 lg:px-6 py-4 pb-24 md:pb-4 min-h-0">
        {/* Main chat column */}
        <div className="flex flex-col min-h-0 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <GlassCard strong className="px-4 py-3 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <ModeChips modes={MODES} activeId={modeId} onChange={setModeId} />
                <button
                  type="button"
                  onClick={() => {
                    const next = !simpleMode;
                    setSimpleMode(next);
                    setSimpleLanguageMode(next);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all",
                    simpleMode
                      ? "border-primary/50 bg-primary/15 text-foreground shadow-[0_0_18px_-4px_oklch(0.62_0.22_290/0.8)]"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:bg-white/10",
                  )}
                >
                  {simpleMode ? "Simple ✓" : "Simple"}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground/80">{getMode(modeId).blurb}</p>
            </GlassCard>
            <div className="flex gap-2">
              <GlowButton size="sm" variant="ghost" aria-label="Past conversations" onClick={() => setShowHistory(!showHistory)} title="Past conversations">
                <Clock className="h-4 w-4" />
              </GlowButton>
              <GlowButton size="sm" variant="ghost" aria-label="New conversation" onClick={startNewConversation} title="New conversation">
                <Plus className="h-4 w-4" />
              </GlowButton>
            </div>
          </div>

          {showHistory && history.length > 0 && (
            <GlassCard strong className="mb-3 p-4 max-h-64 overflow-y-auto">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Past conversations</h3>
              <div className="flex flex-col gap-2">
                {history.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-white/5 transition cursor-pointer" onClick={() => loadSession(s)}>
                    <span className="text-sm text-foreground truncate">{s.title}</span>
                    <GlowButton size="sm" variant="ghost">
                      Continue
                    </GlowButton>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {showSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
              <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/95 p-6 shadow-2xl backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                  aria-label="Close settings"
                >
                  <X className="h-5 w-5" />
                </button>
                <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
                <p className="mt-2 text-sm text-muted-foreground">Adjust voice, Neuro Mode, and accessibility preferences.</p>
                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Neuro Mode</p>
                        <p className="text-xs text-muted-foreground">Shorter, simpler, patient responses.</p>
                      </div>
                      <GlowButton size="sm" variant={neuroMode ? "accent" : "ghost"} onClick={() => setNeuroMode((current) => !current)}>
                        {neuroMode ? "On" : "Off"}
                      </GlowButton>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Simple Language Mode</p>
                        <p className="text-xs text-muted-foreground">Use very simple words, short sentences, and no jargon.</p>
                      </div>
                      <GlowButton size="sm" variant={simpleLanguageMode ? "accent" : "ghost"} onClick={() => setSimpleLanguageMode((current) => !current)}>
                        {simpleLanguageMode ? "On" : "Off"}
                      </GlowButton>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">High Contrast Mode</p>
                        <p className="text-xs text-muted-foreground">Stronger contrast for easier reading.</p>
                      </div>
                      <GlowButton size="sm" variant={highContrastMode ? "accent" : "ghost"} onClick={() => setHighContrastMode((current) => !current)}>
                        {highContrastMode ? "On" : "Off"}
                      </GlowButton>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Text Size</p>
                        <p className="text-xs text-muted-foreground">Choose a comfortable base font size.</p>
                      </div>
                      <select
                        value={textSize}
                        onChange={(e) => setTextSize(e.target.value)}
                        className="rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-foreground"
                      >
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                        <option value="xlarge">Extra Large</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <GlassCard strong className="mt-3 flex-1 flex flex-col min-h-0 overflow-hidden shimmer-border" style={{ height: 'calc(100vh - 220px)', minHeight: 0 }}>
            <h1 className="sr-only">AI Chat Sanctuary</h1>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col gap-5">
              {messages.length === 0 && (
                <div className="m-auto text-center max-w-md">
                  <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl glass-strong glow-soft breathe">
                    <span className="text-3xl">{getMode(modeId).emoji}</span>
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {(() => {
                      const hour = new Date().getHours();
                      return hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
                    })()}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This is your space. No judgment, no pressure. Tell me what's going on.
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-2 text-left">
                    {quickStartPrompts[modeId].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => sendMessage(prompt)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground hover:shadow-[0_0_18px_-4px_oklch(0.62_0.22_290/0.8)]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className={cn("group flex flex-col", m.role === "user" ? "items-end" : "items-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[92%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                        "border backdrop-blur-md",
                        m.role === "user"
                          ? "border-accent/40 bg-accent/15 text-foreground rounded-3xl rounded-tr-sm glow-soft"
                          : "border-primary/40 bg-primary/15 text-foreground rounded-3xl rounded-tl-sm",
                      )}
                      style={{
                        boxShadow:
                          m.role === "user"
                            ? "0 0 30px -10px oklch(0.78 0.16 200 / 0.6)"
                            : "0 0 30px -10px oklch(0.62 0.22 290 / 0.6)",
                      }}
                    >
                      {m.role === "assistant" && !m.content && streaming ? (
                        <TypingIndicator />
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:my-2 prose-strong:text-foreground">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>

                    {m.role === "assistant" && m.content ? (
                      <button
                        type="button"
                        aria-label="Listen to this message"
                        onClick={() => speakText(m.content)}
                        className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-accent transition-colors"
                      >
                        🔊 Listen
                      </button>
                    ) : null}

                    {m.role === "assistant" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 opacity-0 group-hover:opacity-100 transition duration-200 text-xs text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-1">
                          {REACTION_EMOJIS.map((emoji) => (
                            <motion.button
                              key={emoji}
                              whileTap={{ scale: 1.15 }}
                              onClick={() => addReaction(m.id, emoji)}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10"
                            >
                              <span>{emoji}</span>
                              {m.reactions?.[emoji] ? (
                                <span className="text-[11px] text-foreground">{m.reactions[emoji]}</span>
                              ) : null}
                            </motion.button>
                          ))}
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <GlowButton variant="ghost" size="sm" onClick={() => speakText(m.content)}>
                            <Volume2 className="h-4 w-4" />
                          </GlowButton>
                          {voiceMode && (
                            <GlowButton variant="ghost" size="sm" onClick={stopSpeech}>
                              <Square className="h-4 w-4" />
                            </GlowButton>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {error && (
                <div className="mx-auto text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-full px-3 py-1.5">
                  {error}
                </div>
              )}
            </div>

            {voiceMode && (
              <div className="mb-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Voice mode enabled</p>
                    <p className="text-xs text-muted-foreground">EmpathAI will speak assistant responses aloud.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <GlowButton size="sm" variant="ghost" onClick={stopSpeech}>
                      Stop speech
                    </GlowButton>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                      <span>Persona</span>
                      <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-foreground">
                        {VOICE_PERSONAS.find((p) => p.id === selectedPersonaId)?.emoji ?? "🎵"}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {VOICE_PERSONAS.map((persona) => (
                        <button
                          key={persona.id}
                          type="button"
                          onClick={() => setSelectedPersonaId(persona.id)}
                          className={cn(
                            "rounded-2xl border px-3 py-2 text-left text-sm transition",
                            persona.id === selectedPersonaId
                              ? "border-primary bg-primary/15 text-foreground shadow-[0_0_20px_-10px_rgba(129,140,248,0.7)]"
                              : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:bg-white/10",
                          )}
                        >
                          <div className="font-semibold">{persona.name}</div>
                          <div className="mt-1 text-[13px] text-muted-foreground">{persona.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                      <span>Personality</span>
                      <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-foreground">
                        {VOICE_PERSONALITIES.find((p) => p.id === selectedPersonalityId)?.icon ?? "🪷"}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {VOICE_PERSONALITIES.map((personality) => (
                        <button
                          key={personality.id}
                          type="button"
                          onClick={() => setSelectedPersonalityId(personality.id)}
                          className={cn(
                            "rounded-2xl border px-3 py-2 text-left text-sm transition",
                            personality.id === selectedPersonalityId
                              ? "border-primary bg-primary/15 text-foreground shadow-[0_0_20px_-10px_rgba(129,140,248,0.7)]"
                              : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:bg-white/10",
                          )}
                        >
                          <div className="font-semibold">{personality.name}</div>
                          <div className="mt-1 text-[13px] text-muted-foreground">{personality.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Selected voice:</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-foreground">
                    {resolveVoice(VOICE_PERSONAS.find((p) => p.id === selectedPersonaId) ?? VOICE_PERSONAS[0], availableVoices)?.name ?? "Loading available voices..."}
                  </span>
                  <span>{availableVoices.length ? `${availableVoices.length} voices detected` : "Voice loading may take a moment."}</span>
                </div>
              </div>
            )}

            <div className="border-t border-white/5 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  aria-label="Type a message to EmpathAI"
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder={PLACEHOLDERS[phIdx]}
                  className="flex-1 resize-none max-h-[160px] rounded-2xl glass border border-white/10 px-4 py-3 text-[15px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <GlowButton size="md" aria-label="Send message" onClick={send} disabled={!input.trim() || streaming} className="!h-12 !w-12 !px-0">
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </GlowButton>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right contextual panel */}
        <aside className="hidden xl:block">
          <GlassCard strong className="p-5 sticky top-24">
            <MoodLogger />
          </GlassCard>
        </aside>
      </div>

    </>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-2 w-2 rounded-full bg-primary/60"
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function OnboardingModal({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: (name: string, reason: string) => void;
}) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState<string | null>(null);

  const reasons = [
    "School stress",
    "Feeling lonely",
    "Anxiety",
    "Just need to talk",
  ];

  const handleSubmit = () => {
    if (name.trim() && reason) {
      onComplete(name.trim(), reason);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md px-6 py-8 rounded-3xl"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, oklch(0.62 0.22 290 / 0.15), oklch(0.15 0.04 275 / 0.5))",
              border: "1px solid oklch(0.62 0.22 290 / 0.2)",
              boxShadow:
                "0 25px 50px -12px oklch(0.62 0.22 290 / 0.3), inset 0 1px 1px oklch(1 0 0 / 0.1)",
            }}
          >
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Welcome to your sanctuary.
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Let's get to know each other.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  What's your name?
                </label>
                <input
                  value={name}
                  aria-label="Your name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tell me your name"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim() && reason) {
                      handleSubmit();
                    }
                  }}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  What brings you here today?
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {reasons.map((r) => (
                    <motion.button
                      key={r}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setReason(r)}
                      className={cn(
                        "rounded-lg px-3 py-2.5 text-xs font-medium transition-all",
                        reason === r
                          ? "border-primary/50 bg-primary/15 text-foreground"
                          : "border border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                      )}
                      style={
                        reason === r
                          ? {
                              boxShadow:
                                "0 0 20px -5px oklch(0.78 0.16 200 / 0.6)",
                            }
                          : {}
                      }
                    >
                      {r}
                    </motion.button>
                  ))}
                </div>
              </div>

              <GlowButton
                onClick={handleSubmit}
                disabled={!name.trim() || !reason}
                className="w-full"
              >
                Enter your sanctuary →
              </GlowButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
