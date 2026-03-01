"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ChatMessage = {
  id: number;
  content: string;
  sender_email: string;
  created_at: string;
};

const HEARTS = [
  { left: 6, delay: 0, duration: 18, size: 1 },
  { left: 16, delay: 3, duration: 15, size: 1.2 },
  { left: 24, delay: 9, duration: 16, size: 1.1 },
  { left: 33, delay: 1, duration: 14, size: 1.3 },
  { left: 41, delay: 6, duration: 17, size: 1.15 },
  { left: 52, delay: 2, duration: 16, size: 1.25 },
  { left: 60, delay: 8, duration: 14, size: 0.9 },
  { left: 68, delay: 4, duration: 13, size: 1.2 },
  { left: 76, delay: 5, duration: 16, size: 1.1 },
  { left: 84, delay: 2, duration: 18, size: 1.4 },
  { left: 92, delay: 7, duration: 15, size: 1 },
];

const CHAT_TITLE = process.env.NEXT_PUBLIC_CHAT_TITLE?.trim() || "Our Love Chat";
const PARTNER_NAME = process.env.NEXT_PUBLIC_PARTNER_NAME?.trim() || "Love";

function getAllowedEmails() {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAILS || "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map<number, ChatMessage>();

  current.forEach((message) => {
    map.set(message.id, message);
  });

  incoming.forEach((message) => {
    map.set(message.id, message);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function formatClock(dateString: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export default function Home() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const allowedEmails = useMemo(() => getAllowedEmails(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(Boolean(supabase));
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const userEmail = session?.user?.email?.toLowerCase() || "";
  const isAllowed =
    !userEmail || allowedEmails.length === 0 || allowedEmails.includes(userEmail);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isActive = true;

    const syncSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isActive) {
        return;
      }

      if (error) {
        setAuthMessage(error.message);
      }

      setSession(data.session);
      setLoadingSession(false);
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isActive) {
        return;
      }
      setSession(currentSession);
      setAuthMessage("");
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session?.user || !isAllowed) {
      return;
    }

    let isActive = true;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, sender_email, created_at")
        .order("created_at", { ascending: true })
        .limit(300);

      if (!isActive) {
        return;
      }

      if (error) {
        setChatMessage(error.message);
        return;
      }

      setMessages((previous) => mergeMessages(previous, data ?? []));
    };

    void loadMessages();

    const channel = supabase
      .channel("our-love-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((previous) => mergeMessages(previous, [incoming]));
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setChatMessage("Realtime connection dropped. Refresh the page.");
        }
      });

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, session?.user, isAllowed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const requestMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    const cleaned = authEmail.trim().toLowerCase();
    if (!cleaned) {
      setAuthMessage("Enter your email first.");
      return;
    }

    setAuthMessage("Sending magic link...");
    const { error } = await supabase.auth.signInWithOtp({
      email: cleaned,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage("Magic link sent. Open your email to continue.");
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !session?.user) {
      return;
    }
    const senderEmail = session.user.email?.toLowerCase();
    if (!senderEmail) {
      setChatMessage("Your account is missing an email address.");
      return;
    }

    const cleaned = draft.trim();
    if (!cleaned) {
      return;
    }

    setSending(true);
    setChatMessage("");
    const { data, error } = await supabase
      .from("messages")
      .insert({
        content: cleaned,
        sender_email: senderEmail,
      })
      .select("id, content, sender_email, created_at")
      .single();

    setSending(false);

    if (error) {
      setChatMessage(error.message);
      return;
    }

    if (data) {
      setMessages((previous) => mergeMessages(previous, [data]));
    }
    setDraft("");
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setSession(null);
    setMessages([]);
    setDraft("");
    setChatMessage("");
  };

  const missingEnv = !supabase;

  return (
    <div className="romance-page">
      <div className="sky" aria-hidden>
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="heart-field">
          {HEARTS.map((heart) => (
            <span
              className="heart"
              key={`${heart.left}-${heart.delay}`}
              style={{
                left: `${heart.left}%`,
                animationDelay: `${heart.delay}s`,
                animationDuration: `${heart.duration}s`,
                transform: `scale(${heart.size})`,
              }}
            >
              {"\u2665"}
            </span>
          ))}
        </div>
      </div>

      <main className="chat-shell">
        {missingEnv && (
          <section className="glass-panel login-card">
            <h1 className="title">Setup needed</h1>
            <p className="hint">
              Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment.
            </p>
          </section>
        )}

        {!missingEnv && loadingSession && (
          <section className="glass-panel login-card">
            <h1 className="title">Loading your love space...</h1>
          </section>
        )}

        {!missingEnv && !loadingSession && !session?.user && (
          <section className="glass-panel login-card">
            <div>
              <h1 className="title">{CHAT_TITLE}</h1>
              <p className="subtitle">
                A private chat for just the two of you. Sign in with your email and
                the magic link.
              </p>
            </div>

            <form className="stack" onSubmit={requestMagicLink}>
              <label className="label" htmlFor="email">
                Your email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
              <button className="btn btn-primary" type="submit">
                Send magic link
              </button>
              <p className="hint">{authMessage}</p>
            </form>
          </section>
        )}

        {!missingEnv && !loadingSession && session?.user && !isAllowed && (
          <section className="glass-panel login-card">
            <h1 className="title">Access denied</h1>
            <p className="hint error">
              {session.user.email} is not in the allowed list for this private chat.
            </p>
            <button type="button" className="btn btn-muted" onClick={signOut}>
              Sign out
            </button>
          </section>
        )}

        {!missingEnv && !loadingSession && session?.user && isAllowed && (
          <section className="glass-panel chat-card">
            <header className="chat-head">
              <div>
                <h2>{CHAT_TITLE}</h2>
                <p className="meta">Logged in as {session.user.email}</p>
              </div>
              <button type="button" className="btn btn-muted" onClick={signOut}>
                Sign out
              </button>
            </header>

            <div className="messages">
              {messages.length === 0 && (
                <p className="empty">
                  Start with something sweet. Your messages appear instantly for both
                  of you.
                </p>
              )}

              {messages.map((message) => {
                const mine =
                  message.sender_email.toLowerCase() ===
                  (session.user.email || "").toLowerCase();
                return (
                  <div
                    className={`bubble-wrap ${mine ? "mine" : "theirs"}`}
                    key={message.id}
                  >
                    <article className={`bubble ${mine ? "mine" : "theirs"}`}>
                      <p>{message.content}</p>
                      <small>
                        {mine ? "You" : PARTNER_NAME} - {formatClock(message.created_at)}
                      </small>
                    </article>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <div className="composer-row">
                <input
                  className="input"
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write something lovely..."
                  maxLength={1000}
                />
                <button className="btn btn-primary" type="submit" disabled={sending}>
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
              {chatMessage && <p className="hint error">{chatMessage}</p>}
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
