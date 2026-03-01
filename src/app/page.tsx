"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

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

type SessionResponse = {
  authenticated: boolean;
};

type MessagesResponse = {
  messages: ChatMessage[];
};

type MessageResponse = {
  message: ChatMessage;
};

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

function normalizeName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "You";
  }
  return cleaned.slice(0, 40);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong.";
}

async function readError(response: Response) {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return `Request failed (${response.status}).`;
  }

  if (!text) {
    return `Request failed (${response.status}).`;
  }

  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (parsed.error) {
      return parsed.error;
    }
  } catch {
    return `Request failed (${response.status}).`;
  }

  return `Request failed (${response.status}).`;
}

export default function Home() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [secretWord, setSecretWord] = useState("");
  const [nickname, setNickname] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem("lovechat_name") || "";
  });
  const [authMessage, setAuthMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const myName = normalizeName(nickname);

  const loadMessages = useCallback(async () => {
    const response = await fetch("/api/messages", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      setMessages([]);
      throw new Error("Session expired. Enter the secret word again.");
    }
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const data = (await response.json()) as MessagesResponse;
    setMessages((previous) => mergeMessages(previous, data.messages ?? []));
  }, []);

  useEffect(() => {
    let active = true;
    const syncSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await readError(response));
        }
        const data = (await response.json()) as SessionResponse;
        if (!active) {
          return;
        }
        setAuthenticated(Boolean(data.authenticated));
      } catch (error) {
        if (!active) {
          return;
        }
        setAuthMessage(getErrorMessage(error));
      } finally {
        if (active) {
          setLoadingSession(false);
        }
      }
    };
    void syncSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let active = true;
    const syncMessages = async () => {
      try {
        await loadMessages();
        if (active) {
          setChatMessage("");
        }
      } catch (error) {
        if (active) {
          setChatMessage(getErrorMessage(error));
        }
      }
    };

    void syncMessages();
    const timer = window.setInterval(() => {
      void syncMessages();
    }, 2500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authenticated, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const signInWithWord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authenticating) {
      return;
    }

    const passphrase = secretWord.trim();
    if (!passphrase) {
      setAuthMessage("Enter the secret word.");
      return;
    }

    setAuthenticating(true);
    setAuthMessage("Checking secret word...");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });

    setAuthenticating(false);

    if (!response.ok) {
      setAuthMessage(await readError(response));
      return;
    }

    const name = normalizeName(nickname);
    if (name) {
      window.localStorage.setItem("lovechat_name", name);
      setNickname(name);
    }

    setAuthenticated(true);
    setSecretWord("");
    setAuthMessage("");
    setChatMessage("");
    try {
      await loadMessages();
    } catch (error) {
      setChatMessage(getErrorMessage(error));
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authenticated) {
      return;
    }

    const cleaned = draft.trim();
    if (!cleaned) {
      return;
    }

    setSending(true);
    setChatMessage("");
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: cleaned,
        sender: myName,
      }),
    });
    setSending(false);

    if (response.status === 401) {
      setAuthenticated(false);
      setMessages([]);
      setChatMessage("Session expired. Enter the secret word again.");
      return;
    }

    if (!response.ok) {
      setChatMessage(await readError(response));
      return;
    }

    const data = (await response.json()) as MessageResponse;
    if (data.message) {
      setMessages((previous) => mergeMessages(previous, [data.message]));
    }

    setDraft("");
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setLoadingSession(false);
    setMessages([]);
    setDraft("");
    setSecretWord("");
    setAuthMessage("");
    setChatMessage("");
  };

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
        {loadingSession && (
          <section className="glass-panel login-card">
            <h1 className="title">Loading your love space...</h1>
          </section>
        )}

        {!loadingSession && !authenticated && (
          <section className="glass-panel login-card">
            <div>
              <h1 className="title">{CHAT_TITLE}</h1>
              <p className="subtitle">
                A private chat for just the two of you. Enter your shared secret
                word to unlock it.
              </p>
            </div>

            <form className="stack" onSubmit={signInWithWord}>
              <label className="label" htmlFor="secretWord">
                Secret word
              </label>
              <input
                id="secretWord"
                className="input"
                type="password"
                autoComplete="off"
                value={secretWord}
                onChange={(event) => setSecretWord(event.target.value)}
                placeholder="Enter your secret word"
                required
              />
              <label className="label" htmlFor="nickname">
                Your name
              </label>
              <input
                id="nickname"
                className="input"
                type="text"
                autoComplete="off"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Your nickname"
                maxLength={40}
              />
              <button
                className="btn btn-primary"
                type="submit"
                disabled={authenticating}
              >
                {authenticating ? "Checking..." : "Enter chat"}
              </button>
              <p className="hint">{authMessage}</p>
            </form>
          </section>
        )}

        {!loadingSession && authenticated && (
          <section className="glass-panel chat-card">
            <header className="chat-head">
              <div>
                <h2>{CHAT_TITLE}</h2>
                <p className="meta">Signed in as {myName}</p>
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
                  normalizeName(message.sender_email).toLowerCase() ===
                  myName.toLowerCase();
                return (
                  <div
                    className={`bubble-wrap ${mine ? "mine" : "theirs"}`}
                    key={message.id}
                  >
                    <article className={`bubble ${mine ? "mine" : "theirs"}`}>
                      <p>{message.content}</p>
                      <small>
                        {mine ? "You" : message.sender_email} -{" "}
                        {formatClock(message.created_at)}
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
