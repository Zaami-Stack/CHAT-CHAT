"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

type ChatMessage = {
  id: number;
  content: string;
  sender_email: string;
  reply_to_id: number | null;
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

type TypingResponse = {
  typing: string[];
};

function areMessagesEqual(left: ChatMessage[], right: ChatMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftMessage = left[index];
    const rightMessage = right[index];
    if (!leftMessage || !rightMessage) {
      return false;
    }
    if (
      leftMessage.id !== rightMessage.id ||
      leftMessage.content !== rightMessage.content ||
      leftMessage.sender_email !== rightMessage.sender_email ||
      leftMessage.reply_to_id !== rightMessage.reply_to_id ||
      leftMessage.created_at !== rightMessage.created_at
    ) {
      return false;
    }
  }

  return true;
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map<number, ChatMessage>();

  current.forEach((message) => {
    map.set(message.id, message);
  });

  incoming.forEach((message) => {
    map.set(message.id, message);
  });

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  if (areMessagesEqual(current, merged)) {
    return current;
  }

  return merged;
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
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastMessageIdRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const lastTypingPingRef = useRef(0);

  const myName = normalizeName(nickname);
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  const typingLabel = useMemo(() => {
    const unique = Array.from(new Set(typingUsers.map((name) => normalizeName(name))));
    if (unique.length === 0) {
      return "";
    }
    if (unique.length === 1) {
      return `${unique[0]} is typing...`;
    }
    if (unique.length === 2) {
      return `${unique[0]} and ${unique[1]} are typing...`;
    }
    return `${unique[0]} and others are typing...`;
  }, [typingUsers]);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior) => {
    const container = messagesRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, []);

  const postTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!authenticated) {
        return;
      }

      await fetch("/api/typing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sender: myName,
          isTyping,
        }),
      });
    },
    [authenticated, myName],
  );

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingSentRef.current) {
      typingSentRef.current = false;
      void postTypingStatus(false);
    }
  }, [postTypingStatus]);

  const loadMessages = useCallback(async () => {
    const response = await fetch("/api/messages", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      setMessages([]);
      setTypingUsers([]);
      setReplyTo(null);
      throw new Error("Session expired. Enter the secret word again.");
    }
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const data = (await response.json()) as MessagesResponse;
    setMessages((previous) => mergeMessages(previous, data.messages ?? []));
  }, []);

  const loadTyping = useCallback(async () => {
    const response = await fetch(`/api/typing?self=${encodeURIComponent(myName)}`, {
      cache: "no-store",
    });

    if (response.status === 401) {
      setAuthenticated(false);
      setMessages([]);
      setTypingUsers([]);
      setReplyTo(null);
      throw new Error("Session expired. Enter the secret word again.");
    }

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const data = (await response.json()) as TypingResponse;
    setTypingUsers(data.typing ?? []);
  }, [myName]);

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
      stopTyping();
      setTypingUsers([]);
      setReplyTo(null);
      return;
    }

    let active = true;
    const syncMessages = async () => {
      try {
        await Promise.all([loadMessages(), loadTyping()]);
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
  }, [authenticated, loadMessages, loadTyping, stopTyping]);

  useEffect(() => {
    const lastMessageId = messages[messages.length - 1]?.id ?? null;
    if (lastMessageIdRef.current === lastMessageId) {
      return;
    }

    const firstMessage = lastMessageIdRef.current === null && lastMessageId !== null;
    lastMessageIdRef.current = lastMessageId;

    if (lastMessageId === null) {
      setShowJumpToLatest(false);
      return;
    }

    window.requestAnimationFrame(() => {
      if (shouldStickToBottomRef.current || firstMessage) {
        setShowJumpToLatest(false);
        scrollMessagesToBottom(firstMessage ? "auto" : "smooth");
      } else {
        setShowJumpToLatest(true);
      }
    });
  }, [messages, scrollMessagesToBottom]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  const onMessagesScroll = () => {
    const container = messagesRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 72;
    shouldStickToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom && messages.length > 0);
  };

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
      await Promise.all([loadMessages(), loadTyping()]);
    } catch (error) {
      setChatMessage(getErrorMessage(error));
    }
  };

  const onDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setDraft(value);

    if (!authenticated) {
      return;
    }

    const hasText = value.trim().length > 0;
    if (!hasText) {
      stopTyping();
      return;
    }

    if (
      !typingSentRef.current ||
      Date.now() - lastTypingPingRef.current > 2_200
    ) {
      typingSentRef.current = true;
      lastTypingPingRef.current = Date.now();
      void postTypingStatus(true);
    }

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = window.setTimeout(() => {
      typingTimerRef.current = null;
      typingSentRef.current = false;
      void postTypingStatus(false);
    }, 2_300);
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

    stopTyping();
    setSending(true);
    setChatMessage("");
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: cleaned,
        sender: myName,
        replyToId: replyTo?.id ?? null,
      }),
    });
    setSending(false);

    if (response.status === 401) {
      setAuthenticated(false);
      setMessages([]);
      setTypingUsers([]);
      setReplyTo(null);
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
    setReplyTo(null);
    composerInputRef.current?.focus();
  };

  const signOut = async () => {
    stopTyping();
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setLoadingSession(false);
    setMessages([]);
    setTypingUsers([]);
    setReplyTo(null);
    setDraft("");
    setSecretWord("");
    setAuthMessage("");
    setChatMessage("");
    setShowJumpToLatest(false);
    shouldStickToBottomRef.current = true;
    lastMessageIdRef.current = null;
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

            <div className="messages-shell">
              <div className="messages" ref={messagesRef} onScroll={onMessagesScroll}>
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
                  const repliedMessage = message.reply_to_id
                    ? messagesById.get(message.reply_to_id) || null
                    : null;

                  return (
                    <div
                      className={`bubble-wrap ${mine ? "mine" : "theirs"}`}
                      key={message.id}
                    >
                      <article className={`bubble ${mine ? "mine" : "theirs"}`}>
                        {repliedMessage && (
                          <div className={`reply-preview ${mine ? "mine" : "theirs"}`}>
                            <span>{normalizeName(repliedMessage.sender_email)}</span>
                            <p>{repliedMessage.content}</p>
                          </div>
                        )}
                        <p>{message.content}</p>
                        <small>
                          {mine ? "You" : message.sender_email} -{" "}
                          {formatClock(message.created_at)}
                        </small>
                        <div className="bubble-actions">
                          <button
                            type="button"
                            className="reply-btn"
                            onClick={() => {
                              setReplyTo(message);
                              composerInputRef.current?.focus();
                            }}
                          >
                            Reply
                          </button>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>

              {showJumpToLatest && (
                <button
                  type="button"
                  className="jump-latest"
                  onClick={() => {
                    shouldStickToBottomRef.current = true;
                    setShowJumpToLatest(false);
                    scrollMessagesToBottom("smooth");
                  }}
                >
                  Latest
                </button>
              )}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              {replyTo && (
                <div className="replying-to">
                  <div>
                    <strong>Replying to {normalizeName(replyTo.sender_email)}</strong>
                    <p>{replyTo.content}</p>
                  </div>
                  <button
                    type="button"
                    className="reply-cancel"
                    onClick={() => setReplyTo(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {typingLabel && <p className="typing-indicator">{typingLabel}</p>}

              <div className="composer-row">
                <input
                  ref={composerInputRef}
                  className="input"
                  type="text"
                  value={draft}
                  onChange={onDraftChange}
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
