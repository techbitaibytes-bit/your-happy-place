import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { GlassCard } from "@/components/GlassCard";
import { GlowButton } from "@/components/GlowButton";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { useLocalStorage, STORAGE_KEYS, type MoodEntry } from "@/lib/storage";

export const Route = createFileRoute("/sanctuary/mirror")({
  head: () => ({
    meta: [
      { title: "Mood Mirror — On-Device Emotion Sensing | EmpathAI" },
      { name: "description", content: "Optional webcam-based mood sensing that runs entirely on your device. Nothing is uploaded. A calm, private readout of how you might be feeling." },
      { property: "og:title", content: "Mood Mirror — On-Device Emotion Sensing | EmpathAI" },
      { property: "og:description", content: "Private, on-device emotion sensing for teens. No uploads, no tracking." },
      { property: "og:url", content: "https://friendlypal.lovable.app/sanctuary/mirror" },
    ],
    links: [{ rel: "canonical", href: "https://friendlypal.lovable.app/sanctuary/mirror" }],
  }),
  component: MirrorPage,
});

type EmotionMap = Record<string, number>;

const EMOTION_EMOJI: Record<string, string> = {
  neutral: "😐",
  happy: "😊",
  sad: "😢",
  angry: "😠",
  fearful: "😨",
  disgusted: "🤢",
  surprised: "😮",
};

function getMirrorAdvice(emotions: EmotionMap | null, dominant: string | null) {
  if (!emotions || !dominant) return null;
  const sorted = Object.entries(emotions).sort((a, b) => b[1] - a[1]);
  const secondScore = sorted[1]?.[1] ?? 0;
  const mixedEmotion = sorted.slice(1, 3).reduce((sum, [, value]) => sum + value, 0) >= 0.4;

  if (dominant === "angry" || dominant === "fearful" || dominant === "surprised") {
    return {
      title: "Overstimulated",
      message:
        "Your mirror is showing strong activation. Try a gentle break, softer lights, or a paced breathing moment to help your nervous system settle.",
    };
  }

  if (dominant === "neutral" && secondScore >= 0.22) {
    return {
      title: "Masking fatigue",
      message:
        "Your face looks calm, but other emotions are also present. That can mean you are masking how you really feel. It’s okay to pause or share that you need a break.",
    };
  }

  if (dominant === "neutral" && emotions.neutral >= 0.72) {
    return {
      title: "Understimulated",
      message:
        "Your mirror looks quiet and steady. If you feel restless or foggy, a small movement or sensory check-in may help you feel more connected.",
    };
  }

  if (mixedEmotion) {
    return {
      title: "Mixed signal",
      message:
        "There are several emotions present in your expression. That can feel tiring. Notice it without judging yourself and give yourself a gentle moment.",
    };
  }

  return {
    title: "Mirror note",
    message: "This reflection is one helpful signal. Use it as a supportive prompt, not a rule, and treat it with kindness.",
  };
}

function MirrorPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsAvailable, setModelsAvailable] = useState<boolean | null>(null);
  const [emotions, setEmotions] = useState<EmotionMap | null>(null);
  const [dominant, setDominant] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [moods, setMoods] = useLocalStorage<MoodEntry[]>(STORAGE_KEYS.moods, []);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [manualLabel, setManualLabel] = useState<string>("");
  const [manualIntensity, setManualIntensity] = useState<number>(5);

  const start = async () => {
    setError(null);
    setLoading(true);
    try {
      let faceapi: any = null;
      try {
        faceapi = await import("@vladmandic/face-api");
      } catch {
        // dynamic import failed; fall back to manual mode
        setModelsAvailable(false);
      }

      // Prefer locally hosted models at /models; if not present, enable manual fallback.
      const LOCAL_MODEL_PATH = "/models";
      try {
        const probe = await fetch(LOCAL_MODEL_PATH, { method: "HEAD" });
        if (!probe.ok) throw new Error("no local models");
      } catch {
        setModelsAvailable(false);
      }

      if (faceapi && modelsAvailable !== false) {
        // try loading nets; if they fail, fall back to manual mode
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_MODEL_PATH),
            faceapi.nets.faceExpressionNet.loadFromUri(LOCAL_MODEL_PATH),
          ]);
          setModelsAvailable(true);
        } catch (loadErr) {
          setModelsAvailable(false);
        }
      }

      // If models are unavailable, stop here and let the UI offer manual input.
      if (modelsAvailable === false) {
        setError("Emotion sensing unavailable — model files not found in /models. Your words are enough.");
        setLoading(false);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);

      // Run detection every 1.5s to reduce CPU usage.
      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceExpressions();
        if (detection?.expressions) {
          const e = detection.expressions as unknown as EmotionMap;
          setEmotions(e);
          const top = Object.entries(e).sort((a, b) => b[1] - a[1])[0];
          if (top) setDominant(top[0]);
        }
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start camera or models.");
      stop();
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  useEffect(() => () => stop(), []);

  const sorted = emotions
    ? Object.entries(emotions).sort((a, b) => b[1] - a[1]).slice(0, 5)
    : [];

  const mirrorAdvice = getMirrorAdvice(emotions, dominant);

  return (
    <>
      <AnimatedBackground />
      <TopBar />

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 px-4 lg:px-6 py-4 pb-28 md:pb-4">
        <div className="flex flex-col min-w-0">
          <GlassCard strong className="p-6 flex-1 flex flex-col items-center justify-center">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Mood Mirror</h1>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
              A gentle, private view of how you’re feeling — with no uploads and no pressure to perform.
            </p>

            <div className="mt-8 relative w-full max-w-2xl aspect-video rounded-3xl overflow-hidden shimmer-border glass-strong">
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover -scale-x-100 bg-black/40"
              />
              {!active && (
                <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                  <div className="text-center">
                    <Camera className="mx-auto h-10 w-10 mb-3 opacity-60" />
                    <p className="text-sm">Camera off</p>
                  </div>
                </div>
              )}
              {/* Holographic emotion labels */}
              <AnimatePresence>
                {active && dominant && (
                  <motion.div
                    key={dominant}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-4 left-4 flex items-center gap-2 rounded-full px-4 py-2 glass-strong"
                    style={{ boxShadow: "0 0 30px -8px oklch(0.78 0.16 200 / 0.7)" }}
                  >
                    <span className="text-xl">{EMOTION_EMOJI[dominant] ?? "🙂"}</span>
                    <span className="text-sm font-medium capitalize gradient-text">{dominant}</span>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Soft overlay vignette */}
              <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 80px 20px oklch(0.13 0.06 275 / 0.6)" }} />
            </div>

            <div className="mt-6 flex flex-col gap-3 w-full items-center">
              <div className="flex gap-3 w-full justify-center">
                {!active ? (
                  <GlowButton size="md" onClick={start} disabled={loading || modelsAvailable === false}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {loading ? "Loading models…" : "Start mirror"}
                  </GlowButton>
                ) : (
                  <GlowButton variant="ghost" size="md" onClick={stop}>
                    <CameraOff className="h-4 w-4" />
                    Stop
                  </GlowButton>
                )}

                {active && dominant && (
                  <GlowButton
                    size="md"
                    variant="accent"
                    onClick={() => {
                      const label = dominant ?? "neutral";
                      const entry: MoodEntry = {
                        id: crypto.randomUUID(),
                        ts: Date.now(),
                        emoji: EMOTION_EMOJI[label] ?? "🙂",
                        label,
                        intensity: 5,
                      };
                      setMoods([entry, ...moods].slice(0, 100));
                      setSavedMsg(`Saved ${entry.label} to moods`);
                      setTimeout(() => setSavedMsg(null), 2500);
                    }}
                  >
                    Use detected emotion
                  </GlowButton>
                )}
              </div>

              {/* Manual fallback when models unavailable */}
              {modelsAvailable === false && (
                <div className="w-full max-w-xl mt-2">
                  <p className="text-sm text-muted-foreground mb-2">Emotion sensing unavailable. You can pick or type how you feel — your words are enough.</p>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={manualLabel}
                      onChange={(e) => setManualLabel(e.target.value)}
                      placeholder="How are you feeling? (e.g. anxious, calm, sad)"
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <GlowButton
                      size="sm"
                      onClick={() => {
                        const label = (manualLabel || "neutral").trim();
                        const entry: MoodEntry = {
                          id: crypto.randomUUID(),
                          ts: Date.now(),
                          emoji: EMOTION_EMOJI[label] ?? "🙂",
                          label,
                          intensity: manualIntensity,
                        };
                        setMoods([entry, ...moods].slice(0, 100));
                        setSavedMsg(`Saved ${entry.label} to moods`);
                        setManualLabel("");
                        setTimeout(() => setSavedMsg(null), 2500);
                      }}
                    >
                      Save
                    </GlowButton>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(EMOTION_EMOJI).map((k) => (
                      <GlowButton
                        key={k}
                        size="sm"
                        variant="ghost"
                        onClick={() => setManualLabel(k)}
                      >
                        <span className="mr-2">{EMOTION_EMOJI[k]}</span>
                        {k}
                      </GlowButton>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
            {savedMsg && <p className="mt-2 text-xs text-accent">{savedMsg}</p>}
          </GlassCard>
        </div>

        <aside className="hidden xl:block">
          <GlassCard strong className="p-5 sticky top-24">
            <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Reading</h3>
            <p className="mt-1 text-xs text-muted-foreground/80">Live confidence per emotion.</p>
            <div className="mt-4 flex flex-col gap-3">
              {sorted.length === 0 && (
                <p className="text-xs text-muted-foreground/70">Start the mirror to see live readings.</p>
              )}
              {mirrorAdvice && (
                <div className="rounded-3xl border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-primary">{mirrorAdvice.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{mirrorAdvice.message}</p>
                </div>
              )}
              {sorted.map(([name, v]) => (
                <div key={name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="capitalize">{EMOTION_EMOJI[name] ?? "•"} {name}</span>
                    <span className="font-mono text-muted-foreground">{Math.round(v * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      animate={{ width: `${v * 100}%` }}
                      transition={{ duration: 0.4 }}
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg, oklch(0.62 0.22 290), oklch(0.78 0.16 200))" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </aside>
      </div>
    </>
  );
}
