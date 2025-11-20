// lib/sigmaris.ts
const BASE = "http://127.0.0.1:8000";

export async function reflect(text: string) {
  const res = await fetch(`${BASE}/reflect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function introspect() {
  const res = await fetch(`${BASE}/introspect`, {
    method: "POST",
  });
  return res.json();
}

export async function longterm() {
  const res = await fetch(`${BASE}/longterm`, {
    method: "POST",
  });
  return res.json();
}

export async function meta() {
  const res = await fetch(`${BASE}/meta`, {
    method: "POST",
  });
  return res.json();
}

export async function getIdentity() {
  const res = await fetch(`${BASE}/identity`);
  return res.json();
}
