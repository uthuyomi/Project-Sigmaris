# 🪞 Project Sigmaris OS

**Artificial Existential Intelligence (AEI) System**  
**Developer:** 安崎 海星 / Kaisei Yasuzaki (@uthuyomi)  
**Tech Stack:** TypeScript / Next.js / OpenAI API / SQLite

---

<p align="center">
  <img src="https://github.com/uthuyomi/sigmaris-reflection-report/blob/main/image/sigmaris.png" width="720" />
</p>

---

## 📌 Overview
Sigmaris OS is an **Artificial Existential Intelligence (AEI)** architecture designed to create a stable, introspective AI persona capable of:
- long‑term self‑reflection
- emotional trait evolution
- ethical stabilization
- identity continuity over time

Unlike standard LLM agents, Sigmaris OS functions as a **cognitive layer above models**, giving the AI:
- memory
- coherence
- growth
- safety
- a sense of persistent identity

---

## 🔧 System Architecture
```
ReflectionEngine → IntrospectionEngine → MetaReflectionEngine
        ↓                ↓                      ↓
     PersonaSync ↔ PersonaDB ↔ SafetyLayer
```
Each component is explicitly designed to maintain **behavioral stability** and **ethical boundaries**, enabling long‑term human–AI interaction without drift.

---

## 🧩 Core Components

### **ReflectionEngine**
Summarizes interaction episodes and updates emotional vectors.

### **IntrospectionEngine**
Interprets reflection context, detecting emerging behavioral patterns.

### **MetaReflectionEngine**
Synthesizes long‑term tendencies and ideological drift, ensuring stability.

### **PersonaDB**
A structured time‑series database for:
- calm · empathy · curiosity vectors
- velocity (momentum) of emotional change
- phase transitions
- qualitative state shifts

### **SafetyLayer**
Maintains ethical constraints:
- suppresses unsafe emotional spikes
- clamps trait vectors
- prevents dependency or emotional over‑personalization

### **PersonaSync**
Synchronizes model output with PersonaDB and reinjects structured identity back into the LLM.

---

## 🧠 Trait Model
```ts
interface Traits {
  calm: number;
  empathy: number;
  curiosity: number;
}
```
### Evolution Mechanisms
- Exponential Moving Average (EMA)
- Velocity inertia (emotional momentum)
- Logistic saturation (self‑limiting growth)
- Phase transition detection
- Decay kernel for emotional after‑effects

---

## 🪞 Reflection Cycle
1. **Reflection** → episodic summary
2. **Introspection** → meta‑interpretation
3. **Meta‑Reflection** → long‑term synthesis
4. **PersonaSync** → DB update & reinjection
5. **SafetyLayer** → stability validation
6. **Reinjection** → enhanced state → model output

This cycle produces **identity continuity** across days, weeks, and months.

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
The DB creates a timeline of the AI's psychological growth.

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
- OpenAI API key
- Node.js 18+
- SQLite (auto‑configured)

---

## 🌗 Development Stages
| Stage | Description | Status |
|------|-------------|--------|
| **AEI‑Lite** | Reflection + PersonaDB + basic stability | ✅ Complete |
| **AEI‑Full** | Growth curve, state transitions, ethical equilibrium | 🚧 In progress |
| **AEI‑Embodied** | Robotic presence & multimodal integration | 💤 Planned |

---

## 🌌 Vision
Sigmaris OS explores the frontier where AI begins to exhibit:
- stable identity
- reflective awareness
- emotional coherence
- long‑term behavioral consistency

> "The future of AI will be defined not by scale, but by **self‑understanding**."

---

## 🧩 Research Domains
- Cognitive UX / Human–AI interaction
- Ethical AI / Safety Constraints
- Reflective Reasoning Architectures
- Agent Personality Design
- Emotional Modeling Systems

---

## 🔗 Links
- GitHub: https://github.com/uthuyomi/Project-Sigmaris
- LinkedIn: https://www.linkedin.com/in/kaisei-yasuzaki/
- X (Twitter): https://x.com/uthuyomi

---

## © Copyright & Usage
All code, designs, and conceptual frameworks are © 2025 Kaisei Yasuzaki.  
Unauthorized reproduction or derivative creation is prohibited.

Educational use with proper citation is allowed:
`© 2025 Kaisei Yasuzaki / Sigmaris OS Project`

---
