"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type TouchEvent,
} from "react";

type MessageRead = {
  reader_name: string;
  seen_at: string;
};

type ChatMessage = {
  id: number;
  content: string;
  sender_email: string;
  reply_to_id: number | null;
  is_pinned: boolean;
  pinned_at: string | null;
  edited_at: string | null;
  is_deleted: boolean;
  created_at: string;
  message_reads: MessageRead[] | null;
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

type PatchAction = "edit" | "delete" | "pin";

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
      leftMessage.is_pinned !== rightMessage.is_pinned ||
      leftMessage.pinned_at !== rightMessage.pinned_at ||
      leftMessage.edited_at !== rightMessage.edited_at ||
      leftMessage.is_deleted !== rightMessage.is_deleted ||
      readsFingerprint(leftMessage.message_reads) !==
        readsFingerprint(rightMessage.message_reads) ||
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
    map.set(message.id, {
      ...message,
      message_reads: normalizeReads(message.message_reads),
    });
  });

  incoming.forEach((message) => {
    map.set(message.id, {
      ...message,
      message_reads: normalizeReads(message.message_reads),
    });
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

function normalizeReads(reads: MessageRead[] | null | undefined) {
  const list = reads ?? [];
  return [...list].sort((left, right) => {
    const nameCompare = normalizeName(left.reader_name).localeCompare(
      normalizeName(right.reader_name),
    );
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.seen_at.localeCompare(right.seen_at);
  });
}

function readsFingerprint(reads: MessageRead[] | null | undefined) {
  return normalizeReads(reads)
    .map((item) => `${normalizeName(item.reader_name)}|${item.seen_at}`)
    .join(",");
}

function dayKey(dateString: string) {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatDayLabel(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (target === today) {
    return "Today";
  }
  if (target === today - dayMs) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function previewText(input: string) {
  const cleaned = input.trim();
  if (!cleaned) {
    return "";
  }
  if (cleaned.length <= 80) {
    return cleaned;
  }
  return `${cleaned.slice(0, 80)}...`;
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [busyMessageActionId, setBusyMessageActionId] = useState<number | null>(
    null,
  );
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastMessageIdRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const lastTypingPingRef = useRef(0);
  const lastSeenMessageIdRef = useRef(0);
  const longPressTimerRef = useRef<number | null>(null);

  const myName = normalizeName(nickname);
  const myNameLower = myName.toLowerCase();
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  const pinnedMessages = useMemo(() => {
    return [...messages]
      .filter((message) => message.is_pinned)
      .sort((left, right) => {
        const leftDate = left.pinned_at || left.created_at;
        const rightDate = right.pinned_at || right.created_at;
        return new Date(rightDate).getTime() - new Date(leftDate).getTime();
      });
  }, [messages]);

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

  const clearLongPressReply = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const postSeenReceipts = useCallback(
    async (ids: number[]) => {
      if (!authenticated || ids.length === 0) {
        return;
      }

      await fetch("/api/messages/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reader: myName,
          messageIds: ids,
        }),
      });
    },
    [authenticated, myName],
  );

  const maybeMarkSeen = useCallback(
    (list: ChatMessage[]) => {
      if (!authenticated || list.length === 0) {
        return;
      }
      if (!shouldStickToBottomRef.current) {
        return;
      }

      const latestId = list[list.length - 1]?.id ?? 0;
      if (!latestId || latestId === lastSeenMessageIdRef.current) {
        return;
      }

      lastSeenMessageIdRef.current = latestId;
      void postSeenReceipts(list.map((message) => message.id));
    },
    [authenticated, postSeenReceipts],
  );

  const loadMessages = useCallback(async () => {
    const response = await fetch("/api/messages", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      setMessages([]);
      setTypingUsers([]);
      setReplyTo(null);
      setEditingId(null);
      setBusyMessageActionId(null);
      throw new Error("Session expired. Enter the secret word again.");
    }
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const data = (await response.json()) as MessagesResponse;
    setMessages((previous) => mergeMessages(previous, data.messages ?? []));
  }, []);

  const patchMessage = useCallback(
    async (payload: {
      action: PatchAction;
      id: number;
      content?: string;
      pinned?: boolean;
    }) => {
      const response = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          sender: myName,
        }),
      });

      if (response.status === 401) {
        setAuthenticated(false);
        setMessages([]);
        setTypingUsers([]);
        setReplyTo(null);
        setEditingId(null);
        setBusyMessageActionId(null);
        throw new Error("Session expired. Enter the secret word again.");
      }

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as MessageResponse;
      if (!data.message) {
        throw new Error("Message update failed.");
      }
      setMessages((previous) => mergeMessages(previous, [data.message]));
      return data.message;
    },
    [myName],
  );

  const loadTyping = useCallback(async () => {
    const response = await fetch(`/api/typing?self=${encodeURIComponent(myName)}`, {
      cache: "no-store",
    });

    if (response.status === 401) {
      setAuthenticated(false);
      setMessages([]);
      setTypingUsers([]);
      setReplyTo(null);
      setEditingId(null);
      setBusyMessageActionId(null);
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
      setEditingId(null);
      setBusyMessageActionId(null);
      lastSeenMessageIdRef.current = 0;
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
        maybeMarkSeen(messages);
      } else {
        setShowJumpToLatest(true);
      }
    });
  }, [messages, maybeMarkSeen, scrollMessagesToBottom]);

  useEffect(() => {
    return () => {
      stopTyping();
      clearLongPressReply();
    };
  }, [clearLongPressReply, stopTyping]);

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
    if (nearBottom) {
      maybeMarkSeen(messages);
    }
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
    lastSeenMessageIdRef.current = 0;
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
    if (!authenticated || sending) {
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
      setEditingId(null);
      setBusyMessageActionId(null);
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

  const startEditMessage = (message: ChatMessage) => {
    if (message.is_deleted) {
      return;
    }
    setEditingId(message.id);
    setEditingDraft(message.content);
    setReplyTo(null);
  };

  const saveEditedMessage = async (messageId: number) => {
    const cleaned = editingDraft.trim();
    if (!cleaned) {
      setChatMessage("Edited message cannot be empty.");
      return;
    }

    setBusyMessageActionId(messageId);
    setChatMessage("");
    try {
      await patchMessage({
        action: "edit",
        id: messageId,
        content: cleaned,
      });
      setEditingId(null);
      setEditingDraft("");
    } catch (error) {
      setChatMessage(getErrorMessage(error));
    } finally {
      setBusyMessageActionId(null);
    }
  };

  const deleteOwnMessage = async (messageId: number) => {
    setBusyMessageActionId(messageId);
    setChatMessage("");
    try {
      await patchMessage({
        action: "delete",
        id: messageId,
      });
      if (replyTo?.id === messageId) {
        setReplyTo(null);
      }
      if (editingId === messageId) {
        setEditingId(null);
        setEditingDraft("");
      }
    } catch (error) {
      setChatMessage(getErrorMessage(error));
    } finally {
      setBusyMessageActionId(null);
    }
  };

  const togglePin = async (message: ChatMessage) => {
    setBusyMessageActionId(message.id);
    setChatMessage("");
    try {
      await patchMessage({
        action: "pin",
        id: message.id,
        pinned: !message.is_pinned,
      });
    } catch (error) {
      setChatMessage(getErrorMessage(error));
    } finally {
      setBusyMessageActionId(null);
    }
  };

  const startLongPressReply = (
    message: ChatMessage,
    event: TouchEvent<HTMLElement>,
  ) => {
    clearLongPressReply();
    longPressTimerRef.current = window.setTimeout(() => {
      setReplyTo(message);
      setEditingId(null);
      composerInputRef.current?.focus();
      if ("vibrate" in navigator) {
        navigator.vibrate(8);
      }
    }, 420);
    if (event.touches.length > 1) {
      clearLongPressReply();
    }
  };

  const signOut = async () => {
    stopTyping();
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setLoadingSession(false);
    setMessages([]);
    setTypingUsers([]);
    setReplyTo(null);
    setEditingId(null);
    setEditingDraft("");
    setBusyMessageActionId(null);
    setDraft("");
    setSecretWord("");
    setAuthMessage("");
    setChatMessage("");
    setShowJumpToLatest(false);
    shouldStickToBottomRef.current = true;
    lastMessageIdRef.current = null;
    lastSeenMessageIdRef.current = 0;
    clearLongPressReply();
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

            {pinnedMessages.length > 0 && (
              <div className="pinned-strip">
                <span className="pinned-title">Pinned</span>
                <div className="pinned-list">
                  {pinnedMessages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      className="pinned-item"
                      onClick={() => {
                        const target = document.getElementById(`msg-${message.id}`);
                        target?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      <strong>{normalizeName(message.sender_email)}</strong>
                      <p>{previewText(message.content)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="messages-shell">
              <div className="messages" ref={messagesRef} onScroll={onMessagesScroll}>
                {messages.length === 0 && (
                  <p className="empty">
                    Start with something sweet. Your messages appear instantly for both
                    of you.
                  </p>
                )}

                {messages.map((message, index) => {
                  const previousMessage = messages[index - 1];
                  const showDateDivider =
                    !previousMessage ||
                    dayKey(previousMessage.created_at) !== dayKey(message.created_at);
                  const mine =
                    normalizeName(message.sender_email).toLowerCase() ===
                    myNameLower;
                  const repliedMessage = message.reply_to_id
                    ? messagesById.get(message.reply_to_id) || null
                    : null;
                  const seenByOthers = normalizeReads(message.message_reads).filter(
                    (read) => normalizeName(read.reader_name).toLowerCase() !== myNameLower,
                  );
                  const busy = busyMessageActionId === message.id;

                  return (
                    <div key={message.id}>
                      {showDateDivider && (
                        <div className="date-divider">
                          <span>{formatDayLabel(message.created_at)}</span>
                        </div>
                      )}

                      <div
                        id={`msg-${message.id}`}
                        className={`bubble-wrap ${mine ? "mine" : "theirs"}`}
                      >
                        <article
                          className={`bubble ${mine ? "mine" : "theirs"} ${
                            message.is_pinned ? "pinned" : ""
                          }`}
                          onTouchStart={(event) => startLongPressReply(message, event)}
                          onTouchEnd={clearLongPressReply}
                          onTouchMove={clearLongPressReply}
                          onTouchCancel={clearLongPressReply}
                        >
                          {repliedMessage && (
                            <div className={`reply-preview ${mine ? "mine" : "theirs"}`}>
                              <span>{normalizeName(repliedMessage.sender_email)}</span>
                              <p>{previewText(repliedMessage.content)}</p>
                            </div>
                          )}

                          {editingId === message.id && mine && !message.is_deleted ? (
                            <div className="edit-box">
                              <input
                                className="input"
                                type="text"
                                value={editingDraft}
                                onChange={(event) => setEditingDraft(event.target.value)}
                                maxLength={1000}
                                autoFocus
                              />
                              <div className="edit-actions">
                                <button
                                  type="button"
                                  className="reply-btn"
                                  onClick={() => void saveEditedMessage(message.id)}
                                  disabled={busy}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="reply-btn"
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditingDraft("");
                                  }}
                                  disabled={busy}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p>{message.content}</p>
                          )}

                          <small>
                            {mine ? "You" : message.sender_email} -{" "}
                            {formatClock(message.created_at)}
                            {message.edited_at ? " - edited" : ""}
                            {mine
                              ? seenByOthers.length > 0
                                ? " - Seen"
                                : " - Sent"
                              : ""}
                          </small>
                          <div className="bubble-actions">
                            <button
                              type="button"
                              className="reply-btn"
                              onClick={() => {
                                setEditingId(null);
                                setReplyTo(message);
                                composerInputRef.current?.focus();
                              }}
                              disabled={busy}
                            >
                              Reply
                            </button>

                            <button
                              type="button"
                              className="reply-btn"
                              onClick={() => void togglePin(message)}
                              disabled={busy}
                            >
                              {message.is_pinned ? "Unpin" : "Pin"}
                            </button>

                            {mine && !message.is_deleted && (
                              <button
                                type="button"
                                className="reply-btn"
                                onClick={() => startEditMessage(message)}
                                disabled={busy}
                              >
                                Edit
                              </button>
                            )}

                            {mine && (
                              <button
                                type="button"
                                className="reply-btn"
                                onClick={() => void deleteOwnMessage(message.id)}
                                disabled={busy || message.is_deleted}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </article>
                      </div>
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
                    maybeMarkSeen(messages);
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
                    <p>{previewText(replyTo.content)}</p>
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
