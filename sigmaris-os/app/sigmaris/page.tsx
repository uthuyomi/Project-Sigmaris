"use client";

import { useState } from "react";
import {
  reflect,
  introspect,
  longterm,
  meta,
  getIdentity,
} from "@/lib/sigmaris-api";

export default function SigmarisPage() {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<any>(null);

  async function handleReflect() {
    const res = await reflect(input);
    setLog(res);
  }

  async function handleIntrospect() {
    const res = await introspect();
    setLog(res);
  }

  async function handleLong() {
    const res = await longterm();
    setLog(res);
  }

  async function handleMeta() {
    const res = await meta();
    setLog(res);
  }

  async function handleIdentity() {
    const res = await getIdentity();
    setLog(res);
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Sigmaris AEI Control Panel</h1>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="reflect 用入力"
        style={{ width: "100%", height: 100 }}
      />

      <button onClick={handleReflect}>Reflect</button>
      <button onClick={handleIntrospect}>Introspect</button>
      <button onClick={handleLong}>LongTerm</button>
      <button onClick={handleMeta}>Meta</button>
      <button onClick={handleIdentity}>Identity</button>

      <pre
        style={{
          marginTop: 20,
          background: "#111",
          padding: 20,
          color: "#0f0",
        }}
      >
        {log ? JSON.stringify(log, null, 2) : "No output yet"}
      </pre>
    </div>
  );
}
