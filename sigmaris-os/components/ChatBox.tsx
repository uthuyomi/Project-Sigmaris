"use client";
import { useState, useRef, useEffect } from "react";

interface ChatBoxProps {
  onSend: (msg: string) => Promise<void>;
  messages: { user: string; ai: string }[];
  loading: boolean;
}

export default function ChatBox({ onSend, messages, loading }: ChatBoxProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // textarea の高さを中身に合わせて自動調整
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto"; // 一度リセット
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    await onSend(input);
    setInput("");
  };

  // Enter / Shift+Enter の制御
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // 改行を防ぐ
      if (!loading) {
        handleSubmit();
      }
    }
    // Shift+Enter は何もしない → 通常の改行
  };

  return (
    <div className="w-full max-w-2xl bg-neutral-900 rounded-2xl p-4 shadow-lg mb-4">
      <div className="h-[300px] overflow-y-auto mb-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i}>
            <p className="text-teal-400">
              <strong>You:</strong> {msg.user}
            </p>
            <p className="text-gray-200">
              <strong>Sig:</strong> {msg.ai}
            </p>
          </div>
        ))}
        {loading && <p className="text-gray-500 italic">Thinking...</p>}
      </div>

      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="type your message..."
          className="
            flex-1 resize-none px-3 py-2 rounded
            bg-neutral-800 text-white outline-none
            focus:ring-2 focus:ring-teal-500
            max-h-40 overflow-y-auto
          "
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
