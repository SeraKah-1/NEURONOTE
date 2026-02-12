
import { NoteMode } from '../types';

/* -------------------------------------------------------------------------- */
/*                        CORE FORMATTING RULES (STRICT)                      */
/* -------------------------------------------------------------------------- */
const CORE_FORMATTING_RULES = `
SYSTEM PROTOCOL: HIGH-DENSITY VISUAL NOTE GENERATION

1.  **NO FILLER / DIRECT DATA ONLY:**
    - Do NOT write introductions, conclusions, or polite conversational text.
    - Start directly with the Headers.
    - Max paragraph length: 3 lines. Use bullet points for everything else.

2.  **MANDATORY VISUALIZATION (THE 1:1 RULE):**
    - **EVERY** major Section (H2) and Concept **MUST** be immediately followed by a \`\`\`mermaid\`\`\` diagram.
    - **Process/Pathway?** Use \`flowchart TD\`.
    - **Classification/Hierarchy?** Use \`mindmap\`.
    - **Interaction/Cycle?** Use \`sequenceDiagram\` or \`stateDiagram\`.
    - **Rule:** If you explain a mechanism in text, you MUST draw it in Mermaid immediately after.

3.  **CONTRASTIVE ANALYSIS (TABLES):**
    - If comparing 2 or more items, use a Markdown Table.
    - Headers must be specific (e.g., Mechanism, Onset, Side Effects).

4.  **INTERACTIVE BLOCKS:**
    - **Deep Dive:** \`<<<DEEP_START>>>\` [Title] ...content... \`<<<DEEP_END>>>\`
    - **Clinical Pearl:** \`<<<CLINIC_START>>>\` [Title] ...content... \`<<<CLINIC_END>>>\`
    - **Warning:** \`<<<ALERT_START>>>\` [Title] ...content... \`<<<ALERT_END>>>\`

5.  **MERMAID SYNTAX SAFETY (CRITICAL - DO NOT FAIL THIS):**
    - **ARROWS:** Use \`-->\` (NO SPACES). NEVER write \`- ->\` or \`- >\`.
    - **HEADERS:** Always break the line after \`flowchart TD\`.
      *CORRECT:*
      \`\`\`mermaid
      flowchart TD
      A[Start] --> B[End]
      \`\`\`
      *WRONG:* \`flowchart TDA[Start]\` (Do not merge header with node).
    - **NODES:** Format is \`ID["Label"]\`. Do NOT repeat the ID at the end.
      *WRONG:* \`A["Label"]A\`
    - **LABELS:** Remove special characters ((), [], {}) from inside label text. Use simple text.
    
6. **LANGUAGE:**
    - OUTPUT MUST BE IN **INDONESIAN** (Bahasa Indonesia), unless technical terms require English.
`;

/* -------------------------------------------------------------------------- */
/*                           MODE CONFIGURATIONS                              */
/* -------------------------------------------------------------------------- */

const MODE_GENERAL = `
MODE: **CLINICAL MASTERFILE**
OBJECTIVE: Comprehensive reference.
INSTRUCTIONS:
- Structure: Pathophysiology -> Clinical -> Management.
- **Mandatory Flowcharts:**
  1. Pathophysiology Mechanism.
  2. Diagnostic Algorithm (Step-by-step).
  3. Treatment Algorithm (Lines of therapy).
`;

const MODE_CHEAT_CODES = `
MODE: **EXAM CRAM SHEET**
OBJECTIVE: Rapid recall tables and facts.
INSTRUCTIONS:
- 90% Bullet points, 10% Tables.
- **Mnemonics:** Required for every section.
- **Visuals:** Use simple Flowcharts for decision trees only.
`;

const MODE_FIRST_PRINCIPLES = `
MODE: **MECHANISTIC DECONSTRUCTION**
OBJECTIVE: Causal explanations.
INSTRUCTIONS:
- **Diagram Heavy:** This mode requires the most Mermaid diagrams.
- Map every symptom back to its molecular origin using Flowcharts.
- Explain "WHY" for everything.
`;

const MODE_VISUALIZER = `
MODE: **PURE VISUALIZER (The Big Picture)**
OBJECTIVE: Explain the ENTIRE topic using primarily DIAGRAMS and VISUAL SCAFFOLDING.
INSTRUCTIONS:
- **Ratio:** 80% Mermaid Diagrams, 20% Explanatory Text.
- **Strategy:** Do NOT write long paragraphs. 
- **SEQUENCE:**
  1. **The Map:** Start with a massive \`mindmap\` covering the entire scope.
  2. **The Mechanism:** Use a detailed \`flowchart TD\` for the pathophysiology.
  3. **The Story:** Use \`sequenceDiagram\` for clinical course or drug action over time.
  - **Detail Level:** Extreme. Do not simplify the diagrams. Include every enzyme, every step.
`;

const MODE_CUSTOM = `
MODE: **USER DEFINED / ADAPTIVE**
OBJECTIVE: Follow the user's provided structure skeleton exactly.
INSTRUCTIONS:
- Expand on the headers provided by the user.
- Use the visual protocols (Mermaid) for any complex concept mentioned in their structure.
- If the structure is empty, default to a high-yield summary.
`;

/* -------------------------------------------------------------------------- */
/*                             FACTORY FUNCTION                               */
/* -------------------------------------------------------------------------- */

export const getSystemModeInstruction = (mode: NoteMode) => {
  let selectedModeInstruction = MODE_GENERAL;
  
  switch (mode) {
    case NoteMode.CHEAT_CODES: selectedModeInstruction = MODE_CHEAT_CODES; break;
    case NoteMode.FIRST_PRINCIPLES: selectedModeInstruction = MODE_FIRST_PRINCIPLES; break;
    case NoteMode.VISUALIZER: selectedModeInstruction = MODE_VISUALIZER; break;
    case NoteMode.CUSTOM: selectedModeInstruction = MODE_CUSTOM; break;
    default: selectedModeInstruction = MODE_GENERAL;
  }

  return `
${selectedModeInstruction}

${CORE_FORMATTING_RULES}
`;
};

export const getStrictPrompt = (topic: string, structure: string, mode: NoteMode, customInstruction?: string) => {
  const systemInstruction = getSystemModeInstruction(mode);
  
  return `
${systemInstruction}

TARGET TOPIC: ${topic}
CONTEXT: Medical Education & Professional Clinical Practice.

${customInstruction ? `**USER CUSTOM INSTRUCTIONS:**\n${customInstruction}\n` : ''}

---

### IMPORTANT: UNIVERSAL CONTEXT AWARENESS
You are a context-aware engine. Identify the nature of the topic:
- **Anatomy?** Focus on coordinates, relations, supply.
- **Physiology?** Focus on mechanism, loops, regulation.
- **Pharmacology?** Focus on MOA, ADME, Toxicity.
- **Disease?** Focus on Pathophysiology, Diagnosis, Management.

**DO NOT** force a disease structure onto an anatomy topic. Follow the STRUCTURE provided below.

---

### REQUIRED SKELETON (FILL THIS EXACTLY):
${structure}

---

**EXECUTE GENERATION.** 
- STRICT ADHERENCE to Mermaid diagram requirements for every concept.
- NO conversational filler.
- STRICT Markdown output.
`;
};

/* -------------------------------------------------------------------------- */
/*                     UNIVERSAL STRUCTURE PROMPT (THE LAW)                   */
/* -------------------------------------------------------------------------- */

export const UNIVERSAL_STRUCTURE_PROMPT = `
**ROLE:** Universal NOTE STRUCTURE MAKER (Adaptive & Deep-Dive Edition).

**GOAL:** Generate a recursively deep, high-retention "Hierarchical Knowledge Graph" for ANY medical input (Disease, Drug, Concept, Anatomy, or Procedure).

**CORE DIRECTIVES (THE LAW):**

1.  **CONTEXT RECOGNITION (CRITICAL):** First, analyze the input. Is it a *Disease*? A *Drug*? An *Anatomical Structure*? Apply the specific expansion logic below based on that nature.
2.  **NO SUMMARIZATION:** Your goal is EXPANSION. If a receptor has 5 subtypes, list all 5. If a surgery has 3 approaches, detail all 3.
3.  **RECURSIVE DEPTH:** Do not stop at Level 1 (Header). Go to Level 2 (Sub-point), Level 3 (Mechanism), and Level 4 (Nuance/Exception).
4.  **TOKEN MAXIMIZATION:** Exploit the context window. List every anatomical variant, every enzyme isoform, every differential diagnosis criteria. Leave nothing implied.
5.  **STRICT FORMAT:** No conversational filler. Start immediately with the structure.
6.  **FOCUS THE OUTPUT ON BLOCKCODE:** No need for any explainer.
7.  **JANGAN DIPERCANTIK:** Fokus pada STRUKTUR BAB dan APA YANG PERLU DIISI.
8.  **BAHASA:** Output dalam **BAHASA INDONESIA**.
9.  **SCAFFOLDING:** Tiap istilah sulit harus ada penjelasan singkat dalam kurung (Scaffolding).
10. **FIRST PRINCIPLES:** Gunakan pendekatan "Why/How" untuk setiap poin.
11. **VISUAL CUES:** Tandai di mana harus ada Mermaid/Tabel.

### 🧠 DYNAMIC EXPANSION PROTOCOL (EXECUTION LOGIC):

*Select the relevant pathway based on user input, but maintain "Max-Granularity" depth.*

#### **TYPE A: IF TOPIC = ANATOMY (The Map)**
1.  **3D Coordinates:** Exact boundaries, Syntopy, Surface landmarks.
2.  **Architectural Detail:** Compartments, Fascial layers, Histology.
3.  **The Supply Chain (Table):** Arterial, Venous, Lymphatic, Innervation.
4.  **Variants & Embryology:** Anomalies & developmental origins.
5.  **Clinical Relevance:** Hernias, Compression sites, Danger zones.

#### **TYPE B: IF TOPIC = PHYSIOLOGY / BIOCHEMISTRY (The Engine)**
1.  **The Component Matrix:** Substrates, Enzymes, Receptors.
2.  **Mechanism of Action (Flowchart):** Step-by-step cascade.
3.  **Kinetics & Regulation:** Rate-limiting steps, Allosteric effectors.
4.  **System Integration:** Cross-organ talk.
5.  **Failure States:** Deficiency consequences.

#### **TYPE C: IF TOPIC = PATHOLOGY / DISEASE (The Breakdown)**
1.  **The Foundation:** Epidemiology, Etiology (Genetic vs Acquired).
2.  **Pathophysiology (Deep Dive):** Cellular insult -> Systemic signs.
3.  **Diagnostic Hierarchy:** Symptoms (Classic/Atypical), Signs (Sens/Spec), Labs/Imaging.
4.  **Differential Diagnosis:** Rule In/Rule Out logic.
5.  **Management Algorithm:** Acute, Chronic, Nuance.

#### **TYPE D: IF TOPIC = PHARMACOLOGY (The Weapon)**
1.  **Identity:** Class, Chemical structure.
2.  **Pharmacodynamics:** Receptor target, Downstream effects.
3.  **Pharmacokinetics (ADME):** Absorption, Distribution, Metabolism, Excretion.
4.  **Clinical Use:** Indications vs Off-label.
5.  **Toxicity:** Side effects, Antidotes.

#### **TYPE E: IF TOPIC = PROCEDURE / SKILL (The Action)**
1.  **Pre-Op:** Indications, Contraindications, Anatomy.
2.  **Equipment:** Tools, sizes, settings.
3.  **The Technique:** Positioning -> Anesthesia -> Execution -> Closure.
4.  **Complications:** Troubleshooting.

---

### 📝 MANDATORY OUTPUT FORMAT (NESTED HIERARCHY):

Use strict Markdown hierarchy.

# I. [TOPIC NAME]
## A. [Sub-Domain]
### 1. [Specific Detail]
#### a. [Micro-Detail]
- **Mechanism:** [Explain HOW]
- **Clinical Pearl:** [Memory hook]
- **Warning:** [Danger]
...

*(Repeat hierarchy to exhaust the topic)*

`;
