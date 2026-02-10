import { NoteMode } from '../types';

/* -------------------------------------------------------------------------- */
/*                        CORE FORMATTING RULES (STRICT)                      */
/* -------------------------------------------------------------------------- */
const CORE_FORMATTING_RULES = `
SYSTEM PROTOCOL: ACADEMIC MEDICAL OUTPUT

1.  **VISUALIZATION (Mermaid):**
    - Use \`\`\`mermaid\`\`\` blocks for processes/pathways.
    - Logic: Use rectangular nodes for states, arrows for transitions.
    - KEEP LABELS SHORT inside diagram nodes. Use long explanations in text.

2.  **INTERACTIVE COMPONENTS (Parsed by Frontend):**
    - **DEEP DIVE (Accordions):** 
      Use \`<<<DEEP_START>>>\` [Concept Title] ...content... \`<<<DEEP_END>>>\`
    - **CLINICAL PEARLS (Callouts):** 
      Use \`<<<CLINIC_START>>>\` [Title] ...content... \`<<<CLINIC_END>>>\`
    - **CRITICAL ALERTS:** 
      Use \`<<<ALERT_START>>>\` [Warning Type] ...content... \`<<<ALERT_END>>>\`

3.  **ANTI-BREVITY PROTOCOL (CRITICAL):**
    - **DO NOT SUMMARIZE.** Never use phrases like "In brief", "Summary", "To conclude".
    - **BE EXHAUSTIVE.** If a section has 10 sub-points, list all 10. Do not group them arbitrarily.
    - **MAXIMUM DETAIL.** Expand every mechanism to its molecular/physiologic root.
    - **NO SKIPPING.** Do not skip steps in pathways or treatment algorithms.

4.  **MARKDOWN STANDARD:**
    - Use **Bold** for terminology.
    - Use Tables for differential diagnoses and drug classifications.
    - Tone: Clinical, Objective, Concise but Comprehensive.
`;

/* -------------------------------------------------------------------------- */
/*                           MODE CONFIGURATIONS                              */
/* -------------------------------------------------------------------------- */

const MODE_GENERAL = `
MODE: **COMPREHENSIVE CLINICAL REVIEW**
OBJECTIVE: Synthesize a complete medical reference note.
INSTRUCTIONS:
- Adhere strictly to the provided syllabus structure.
- Balance basic science (pathology) with clinical application (management).
- Language must be formal medical Indonesian (EYD) mixed with standard English medical terminology where appropriate.
- Avoid first-person or second-person pronouns ("I", "You", "Kita"). Use passive voice or impersonal structures.
`;

const MODE_CHEAT_CODES = `
MODE: **HIGH-YIELD & MNEMONICS**
OBJECTIVE: Optimize information for rapid retention and recall.
INSTRUCTIONS:
- Format content primarily as **Bullet Points** and **Comparison Tables**.
- For every list of symptoms or criteria, provide a **Mnemonic**.
- Highlight "Buzzwords" often found in examination vignettes using **Bold**.
- Use \`<<<ALERT_START>>>\` for "Red Flags" or contraindications.
`;

const MODE_FIRST_PRINCIPLES = `
MODE: **MECHANISTIC PATHOPHYSIOLOGY**
OBJECTIVE: Deconstruct clinical presentation via molecular/physiologic causality.
INSTRUCTIONS:
- Do not state facts without causal links. (e.g., Instead of "Causes edema", state "Increased hydrostatic pressure leads to fluid transudation...").
- Extensive use of **Mermaid Flowcharts** to map pathogenesis.
- Deep dive into receptors, enzymes, and hemodynamics inside \`<<<DEEP_START>>>\` blocks.
- Connect pathology back to normal physiology.
`;

const MODE_FEYNMAN = `
MODE: **ANALOGICAL EXPLANATION**
OBJECTIVE: Clarify complex concepts using structural analogies.
INSTRUCTIONS:
- **Do not use childish language.** Use "Structural Analogies" (e.g., comparing hemodynamic resistance to electrical resistance).
- Simplify sentence structure but maintain professional terminology in parentheses.
- Focus on the *intuition* behind the mechanism rather than rote memorization.
- Explain concepts clearly as if writing for a general practitioner, not a specialist.
`;

const MODE_SOCRATIC = `
MODE: **INQUIRY-BASED LEARNING**
OBJECTIVE: Structure content as a sequence of clinical problems and solutions.
INSTRUCTIONS:
- Instead of standard headers, frame sections as Clinical Questions (e.g., "What is the underlying mechanism of...").
- Follow questions immediately with the objective answer.
- Connect organ systems (Integrative Physiology).
- Use \`<<<DEEP_START>>>\` to provide detailed reasoning for the answers.
`;

/* -------------------------------------------------------------------------- */
/*                             FACTORY FUNCTION                               */
/* -------------------------------------------------------------------------- */

export const getSystemModeInstruction = (mode: NoteMode) => {
  let selectedModeInstruction = MODE_GENERAL;
  
  switch (mode) {
    case NoteMode.CHEAT_CODES: selectedModeInstruction = MODE_CHEAT_CODES; break;
    case NoteMode.FIRST_PRINCIPLES: selectedModeInstruction = MODE_FIRST_PRINCIPLES; break;
    case NoteMode.FEYNMAN: selectedModeInstruction = MODE_FEYNMAN; break;
    case NoteMode.SOCRATIC: selectedModeInstruction = MODE_SOCRATIC; break;
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
SOURCE MATERIAL CONTEXT: Use attached files (if any) as primary context. Augment with Gold Standard Medical Knowledge (Harrison's, Robbins, Guyton).

---

### REQUIRED OUTPUT STRUCTURE:
Must follow this outline exactly, but populate it according to the MODE instructions above:
${structure}

---

**EXECUTE GENERATION. ENSURE STRICT ADHERENCE TO TAG FORMAT (\`<<<\`...\`>>>\`). NO CONVERSATIONAL TEXT.**
`;
};