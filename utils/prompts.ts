
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

5.  **MERMAID SYNTAX SAFETY:**
    - Label nodes simply: \`A[Label]\`.
    - DO NOT use brackets inside the label text.
    - Keep chart structure simple but data-rich.
    
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
- Example: \`Insult -> Cell Injury -> Mediator Release -> Clinical Sign\`.
- Explain "WHY" for everything.
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
    case NoteMode.CUSTOM: selectedModeInstruction = MODE_CUSTOM; break;
    default: selectedModeInstruction = MODE_GENERAL;
  }

  return `
${selectedModeInstruction}

${CORE_FORMATTING_RULES}
`;
};

export const getStrictPrompt = (topic: string, structure: string, mode: NoteMode) => {
  const systemInstruction = getSystemModeInstruction(mode);
  
  return `
${systemInstruction}

TARGET TOPIC: ${topic}
CONTEXT: Medical Education & Professional Clinical Practice.

---

### REQUIRED SKELETON:
${structure}

---

**EXECUTE GENERATION.** 
- STRICT ADHERENCE to Mermaid diagram requirements for every concept.
- NO conversational filler.
- STRICT Markdown output.
`;
};
