import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback, type ComponentType } from "react";
import { motion } from "motion/react";
import { Phone, MessageSquare, Globe, ShieldAlert, Loader2, Users, MapPin, Link2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { GlassCard } from "@/components/GlassCard";
import { GlowButton } from "@/components/GlowButton";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


export const Route = createFileRoute("/sanctuary/crisis")({
  head: () => ({
    meta: [
      { title: "Crisis Help & Local Support — EmpathAI" },
      { name: "description", content: "Immediate crisis hotlines (988, Crisis Text Line, iCall India) plus an AI-powered locator for nearby teen-friendly mental health resources." },
      { property: "og:title", content: "Crisis Help & Local Support — EmpathAI" },
      { property: "og:description", content: "Crisis hotlines and a locator for nearby teen mental health support." },
      { property: "og:url", content: "https://friendlypal.lovable.app/sanctuary/crisis" },
    ],
    links: [{ rel: "canonical", href: "https://friendlypal.lovable.app/sanctuary/crisis" }],
  }),
  component: CrisisPage,
});

type SupportItem = {
  name: string;
  type: string;
  phone: string;
  website: string;
  description: string;
};
// Only allow https:// URLs from AI-generated content.
// Blocks javascript:, data:, http:, and any other scheme.
function safeHref(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}
function parseSupportItems(raw: string): SupportItem[] {
  if (!raw) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: try to extract a JSON object or array from prose
    const objStart = raw.indexOf("{");
    const objEnd = raw.lastIndexOf("}");
    const arrStart = raw.indexOf("[");
    const arrEnd = raw.lastIndexOf("]");
    try {
      if (objStart !== -1 && objEnd > objStart) {
        parsed = JSON.parse(raw.slice(objStart, objEnd + 1));
      } else if (arrStart !== -1 && arrEnd > arrStart) {
        parsed = JSON.parse(raw.slice(arrStart, arrEnd + 1));
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }
  const arr: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.resources)
      ? parsed.resources
      : Array.isArray(parsed?.results)
        ? parsed.results
        : [];
  return arr
    .map((r: any): SupportItem => ({
      name: String(r?.name ?? "").trim(),
      type: String(r?.type ?? "").trim(),
      phone: String(r?.phone ?? "").trim(),
      website: String(r?.website ?? "").trim(),
      description: String(r?.description ?? "").trim(),
    }))
    .filter((r) => r.name && (r.phone || r.website));
}


const SUPPORT_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  hotline: Phone,
  crisis: Phone,
  text: MessageSquare,
  counseling: Users,
  group: Users,
  online: Globe,
  lgbtq: Link2,
  default: MapPin,
};

function CrisisPage() {
  const [city, setCity] = useState("");
  const [resultsText, setResultsText] = useState("");
  const [supportItems, setSupportItems] = useState<SupportItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const findLocal = useCallback(async () => {
    const q = city.trim();
    if (!q) {
      setError("Please enter a city.");
      return;
    }
    setError(null);
    setResultsText("");
    setSupportItems([]);
    setStreaming(true);

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Client-side sanitize: strip control chars, collapse whitespace, cap length.
    // The server re-sanitizes and treats this as data (not instructions).
    const safeLocation = q
      .replace(/[\u0000-\u001F\u007F]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preset: "crisis-locator",
          location: safeLocation,
        }),
        signal: ctrl.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = JSON.parse(text);
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      setResultsText(text);
      setSupportItems(parseSupportItems(text));

    } catch (e) {
      if ((e as any).name === "AbortError") {
        setError("Search cancelled.");
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [city]);

  const iconForType = (type: string) => {
    const lower = type.toLowerCase();
    const Icon = Object.entries(SUPPORT_ICON_MAP).find(([key]) => lower.includes(key))?.[1] ?? SUPPORT_ICON_MAP.default;
    return Icon;
  };

  const copyToClipboard = async (value: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
    } catch {
      // Ignore clipboard issues and keep the flow moving.
    }
  };

  return (
    <>
      <AnimatedBackground />
      <TopBar />

      <div className="flex-1 px-4 lg:px-6 py-4 pb-28 md:pb-4">
        <div className="mx-auto max-w-4xl grid gap-4">
          <GlassCard strong glow="accent" className="p-6 border-accent/30">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-accent shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Find Support Near Me</h1>
                <p className="mt-1 text-sm text-muted-foreground">Search for local teen mental health and neurodiverse resources with warm, practical next steps.</p>
              </div>
            </div>

            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              <a href="tel:988" className="flex items-center gap-3 rounded-2xl glass px-4 py-3 hover:bg-white/5 transition">
                <Phone className="h-5 w-5 text-accent" />
                <div>
                  <div className="font-semibold">Call 988</div>
                  <div className="text-xs text-muted-foreground">US Suicide & Crisis Lifeline · 24/7</div>
                </div>
              </a>
              <a href="sms:741741?body=HOME" className="flex items-center gap-3 rounded-2xl glass px-4 py-3 hover:bg-white/5 transition">
                <MessageSquare className="h-5 w-5 text-accent" />
                <div>
                  <div className="font-semibold">Text HOME to 741741</div>
                  <div className="text-xs text-muted-foreground">Crisis Text Line · US/CA</div>
                </div>
              </a>
              <a href="https://findahelpline.com" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl glass px-4 py-3 hover:bg-white/5 transition sm:col-span-2">
                <Globe className="h-5 w-5 text-accent" />
                <div>
                  <div className="font-semibold">findahelpline.com</div>
                  <div className="text-xs text-muted-foreground">International directory of free helplines</div>
                </div>
              </a>
              <a href="tel:9152987821" className="flex items-center gap-3 rounded-2xl glass px-4 py-3 hover:bg-white/5 transition sm:col-span-2">
                <Phone className="h-5 w-5 text-accent" />
                <div>
                  <div className="font-semibold">iCall India — 9152987821</div>
                  <div className="text-xs text-muted-foreground">Free counselling · Mon–Sat 8am–10pm IST</div>
                </div>
              </a>
            </div>
          </GlassCard>

          <GlassCard className="mt-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">Right now: a grounding breath</h2>
            <p className="mt-1 text-sm text-muted-foreground">Breathe in for 4. Hold for 7. Out for 8. Repeat.</p>
            <div className="mt-6 flex flex-col items-center gap-4">
              <motion.div
                className="h-28 w-28 rounded-full"
                style={{
                  background: 'radial-gradient(circle, oklch(0.62 0.22 290 / 0.6), oklch(0.78 0.16 200 / 0.2))',
                  boxShadow: '0 0 40px oklch(0.62 0.22 290 / 0.3)',
                }}
                animate={{ scale: [1, 1.4, 1.4, 1, 1] }}
                transition={{
                  duration: 19,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  times: [0, 0.21, 0.58, 0.79, 1],
                }}
              />
              <p className="text-xs text-muted-foreground/70">Follow the circle. Let your breath lead.</p>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold tracking-tight">Search by city or postal code</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enter a city or postal code and the AI will suggest nearby teen-friendly resources.</p>

            <div className="mt-4 flex gap-3 flex-col sm:flex-row">
              <input
                value={city}
                aria-label="City or postal code"
                onChange={(e) => setCity(e.target.value)}
                placeholder="City or postal code"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <GlowButton size="sm" onClick={findLocal} disabled={streaming}>
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find Support"}
              </GlowButton>
            </div>

            <div className="mt-4 space-y-4">
              <GlassCard className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">988 Suicide & Crisis Lifeline</p>
                    <p className="text-xs text-muted-foreground">Always available 24/7 in the US — call or text 988.</p>
                  </div>
                  <GlowButton size="sm" variant="ghost" onClick={() => copyToClipboard("988")}>Copy</GlowButton>
                </div>
              </GlassCard>

              {error && <div className="text-xs text-destructive">{error}</div>}

              {streaming && !resultsText && <div className="text-sm text-muted-foreground">Searching...</div>}

              {supportItems.length > 0 ? (
                <div className="rounded-2xl glass overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="w-[34%]">Resource</TableHead>
                        <TableHead className="w-[18%]">Type</TableHead>
                        <TableHead className="w-[24%]">Phone</TableHead>
                        <TableHead className="w-[24%]">Website</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supportItems.map((item, index) => {
                        const Icon = iconForType(item.type);
                        const telHref = item.phone ? `tel:${item.phone.replace(/[^\d+]/g, "")}` : "";
                        return (
                          <TableRow key={`${item.name}-${index}`} className="border-white/10 align-top">
                            <TableCell className="py-3">
                              <div className="flex items-start gap-2">
                                <Icon className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm leading-tight">{item.name}</div>
                                  {item.description && (
                                    <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              {item.type ? (
                                <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                                  {item.type}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              {item.phone ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <a
                                    href={telHref}
                                    className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-mono text-accent hover:bg-accent/25 transition"
                                  >
                                    <Phone className="h-3 w-3" /> {item.phone}
                                  </a>
                                  <button
                                    onClick={() => copyToClipboard(item.phone)}
                                    className="inline-flex items-center rounded-full bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10 transition"
                                    aria-label={`Copy ${item.name} phone`}
                                  >
                                    Copy
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              {item.website ? (
                                <a
                                  href={safeHref(item.website)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15 transition break-all"
                                >
                                  <Globe className="h-3 w-3 shrink-0" /> Visit
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                !streaming && resultsText ? (
                  <div className="rounded-2xl bg-white/5 p-4 text-sm text-muted-foreground">
                    We couldn't format those suggestions yet. Please try again.
                  </div>
                ) : (
                  !streaming && (
                    <div className="rounded-2xl bg-white/5 p-4 text-sm text-muted-foreground">
                      No results yet. Enter a location and click Find Support.
                    </div>
                  )
                )
              )}


              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
                These suggestions are AI-generated. Always verify contact details before reaching out.
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </>
  );
}
