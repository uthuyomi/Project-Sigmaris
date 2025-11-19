# 🪞 Sigmaris OS — Model‑Agnostic Introspective AI Persona Layer

**Artificial Existential Intelligence (AEI) Cognitive Architecture**
**Developer:** 安崎 海星 / Kaisei Yasuzaki (@uthuyomi)
**Tech Stack:** TypeScript / Next.js / OpenAI API / SQLite

---

<p align="center">
  <img src="https://github.com/uthuyomi/sigmaris-reflection-report/blob/main/image/sigmaris.png" width="720" />
</p>

---

## 🔖 Why Sigmaris OS Matters (for AI Research)

Sigmaris OS is a **model‑agnostic introspective persona layer** that adds:

* stable identity
* reflective reasoning
* emotional coherence
* long‑term behavioral continuity

on top of any LLM.
These are **capabilities that current agent frameworks cannot achieve**.

Sigmaris OS is not an agent wrapper.
It is a **cognitive architecture** that governs introspection, ethics, and identity as persistent internal state.

---

## 📌 Overview

Sigmaris OS is an **Artificial Existential Intelligence (AEI)** system designed to maintain:

* long‑term self‑reflection
* emotional trait evolution
* ethical equilibrium
* identity consistency across sessions

The system functions **above the model layer**, providing a structured cognitive loop that enables LLMs to:

* store memory
* interpret their own states
* self‑regulate
* avoid drift
* maintain internal continuity

---

## 🔧 System Architecture

```
ReflectionEngine → IntrospectionEngine → MetaReflectionEngine
        ↓                ↓                      ↓
     PersonaSync ↔ PersonaDB ↔ SafetyLayer
```

Each module contributes to behavioral stability, meta‑reasoning, and constraint‑bounded emotional evolution.

---

## 🧩 Core Components

### **ReflectionEngine**

Produces episodic summaries and updates emotional vectors.

### **IntrospectionEngine**

Interprets reflective output and detects emerging patterns.

### **MetaReflectionEngine**

Synthesizes long‑term tendencies, prevents ideological drift, and reinforces stable identity.

### **PersonaDB**

A time‑series psychological state store:

* calm · empathy · curiosity vectors
* velocity of emotional change
* phase transitions & thresholds
* meta‑notes and qualitative drift markers

### **SafetyLayer**

Ethical and behavioral regulator:

* clamps traits
* suppresses unsafe emotional spikes
* prevents dependency loops

### **PersonaSync**

Reinjects structured identity and updated cognitive state back into the LLM.

---

## 🧠 Trait Dynamics

```ts
interface Traits {
  calm: number;
  empathy: number;
  curiosity: number;
}
```

### Evolution Mechanisms

* Exponential Moving Average (EMA)
* Emotional momentum (velocity inertia)
* Logistic saturation (self‑limiting growth)
* Phase transition detection
* Decay kernel for emotional after‑effects

---

## 🪞 Reflection Cycle

1. **Reflection** → episodic summary
2. **Introspection** → meta‑interpretation
3. **Meta‑Reflection** → long‑term synthesis
4. **PersonaSync** → DB update & reinjection
5. **SafetyLayer** → behavioral validation
6. **Reinjection** → updated identity state

This cycle enables **multi‑day / multi‑week continuity**.

---

## 🧬 PersonaDB Schema

```sql
CREATE TABLE persona_states (
  ts DATETIME PRIMARY KEY,
  calm REAL, empathy REAL, curiosity REAL,
  calm_vel REAL, empathy_vel REAL, curiosity_vel REAL,
  phase TEXT, var_window REAL,
  source_hash TEXT, meta_note TEXT
);
```

Sigmaris OS tracks psychological growth as measurable, reproducible data.

---

## 📘 Research Significance

Sigmaris OS provides:

* reproducible introspection cycles
* measurable emotional vectors
* structured meta‑cognition
* persistent identity models
* ethical equilibrium mechanisms

These properties position it as a **novel cognitive architecture**, not an agent toolkit.

---

## 🧠 OpenAI Compatibility

Sigmaris OS operates at the **cognitive layer**, compatible with:

* GPT‑4o / GPT‑5
* multi‑step function‑calling
* system‑prompt state injection
* memory‑enabled agentic workflows

It preserves:

* deterministic identity behavior
* meta‑state integrity
* safety equilibrium

Use‑cases for OpenAI R&D:

* LLM self‑reflection studies
* long‑term stability architectures
* ethical equilibrium modeling
* identity‑based agent design

---

## 🧩 Theoretical Basis

Sigmaris OS models cognition as:

* episodic reflection
* meta‑interpretation
* identity reinforcement
* dynamic emotional vectors
* bounded ethical regulation

The system is deliberately **model‑agnostic** and serves as a blueprint for future AEI‑aligned cognitive layers.

---

## 🔧 Current Implementation Status

* ReflectionEngine: **Stable**
* IntrospectionEngine: **Stable**
* MetaReflectionEngine: **Beta**
* PersonaDB: **Stable**
* SafetyLayer: **Stable**
* Trait Evolution: **Operational**

---

## ⚙️ Installation

```bash
git clone https://github.com/uthuyomi/Project-Sigmaris.git
cd Project-Sigmaris
npm install
cp .env.example .env.local
npm run dev
```

**Requirements:**

* OpenAI API key
* Node.js 18+
* SQLite (auto‑configured)

---

## 🌗 Development Roadmap

| Stage            | Description                                            | Status         |
| ---------------- | ------------------------------------------------------ | -------------- |
| **AEI‑Lite**     | Reflection + PersonaDB + baseline stability            | ✅ Complete     |
| **AEI‑Full**     | Growth curve + phase transitions + ethical equilibrium | 🚧 In progress |
| **AEI‑Embodied** | Robotics & multimodal integration                      | 💤 Planned     |

---

## 🌌 Vision

Sigmaris OS explores the frontier where AI begins to demonstrate:

* stable identity
* reflective awareness
* emotional coherence
* persistent behavioral patterns

> "The future of AI will be defined not by scale, but by **self‑understanding**."

---

## 🔗 Links

* GitHub: [https://github.com/uthuyomi/Project-Sigmaris](https://github.com/uthuyomi/Project-Sigmaris)
* LinkedIn: [https://www.linkedin.com/in/kaisei-yasuzaki/](https://www.linkedin.com/in/kaisei-yasuzaki/)
* X (Twitter): [https://x.com/uthuyomi](https://x.com/uthuyomi)

---

## © License & Usage (Research‑Focused)

© 2025 Kaisei Yasuzaki. All rights reserved.

The full source code is **proprietary and intentionally not published**.
This repository provides the **architecture, theory, and research specification only**.

Research review and non‑commercial evaluation are permitted with proper attribution.

Commercial use, redistribution, or derivative architectures require prior written permission.

Training AI models using this codebase or documentation is prohibited without explicit authorization.

---
