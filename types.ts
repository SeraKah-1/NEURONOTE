
export enum AIProvider {
  GEMINI = 'gemini',
  GROQ = 'groq'
}

export enum AppModel {
  // --- GEMINI MODELS ---
  GEMINI_3_PRO = 'gemini-3-pro-preview',
  GEMINI_3_FLASH = 'gemini-3-flash-preview',
  GEMINI_2_5_PRO = 'gemini-2.5-pro',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE = 'gemini-2.5-flash-lite',

  // --- GROQ MODELS (Production) ---
  GROQ_LLAMA_3_3_70B = 'llama-3.3-70b-versatile',
  GROQ_LLAMA_3_1_8B = 'llama-3.1-8b-instant',
  GROQ_GPT_OSS_120B = 'openai/gpt-oss-120b',
  GROQ_GPT_OSS_20B = 'openai/gpt-oss-20b',
  
  // --- GROQ MODELS (Preview) ---
  GROQ_LLAMA_4_MAVERICK = 'meta-llama/llama-4-maverick-17b-128e-instruct',
  GROQ_LLAMA_4_SCOUT = 'meta-llama/llama-4-scout-17b-16e-instruct',
  GROQ_QWEN_3_32B = 'qwen/qwen3-32b',
  GROQ_KIMI_K2 = 'moonshotai/kimi-k2-instruct-0905',

  // --- GROQ SYSTEMS ---
  GROQ_COMPOUND = 'groq/compound',
  GROQ_COMPOUND_MINI = 'groq/compound-mini'
}

export enum NoteMode {
  GENERAL = 'general',           // Standard Clinical Structure
  CHEAT_CODES = 'cheat_codes',   // Mnemonics & High Yield Tables
  FIRST_PRINCIPLES = 'principles', // Mechanistic & Pathophysiological
  FEYNMAN = 'feynman',           // Analogical & Simplified (Non-conversational)
  SOCRATIC = 'socratic'          // Inquiry-Based Structure
}

export enum StorageType {
  LOCAL = 'local',
  SUPABASE = 'supabase'
}

export enum AppView {
  WORKSPACE = 'workspace',
  SYLLABUS = 'syllabus',
  HISTORY = 'history',
  SETTINGS = 'settings'
}

export interface GenerationConfig {
  provider: AIProvider;
  model: AppModel;
  temperature: number;
  apiKey?: string;     // Gemini Key
  groqApiKey?: string; // Groq Key
  mode: NoteMode;
  storageType: StorageType;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface UploadedFile {
  name: string;
  mimeType: string;
  data: string; // Base64 content without prefix
}

export interface NoteData {
  topic: string;
  structure: string;
  files: UploadedFile[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  topic: string;
  mode: NoteMode;
  content: string;
  provider: AIProvider;
}

export interface SyllabusItem {
  id: string;
  topic: string;
  status: 'pending' | 'active' | 'done';
}

export interface SavedQueue {
  id: string;
  name: string;
  items: SyllabusItem[];
  timestamp: number;
}

export interface AppState {
  isLoading: boolean;
  generatedContent: string | null;
  error: string | null;
  progressStep: string;
  currentView: AppView; // Changed from individual show booleans to a unified view state
}

export const DEFAULT_STRUCTURE = `1. Definisi & Klasifikasi
2. Etiologi & Faktor Risiko
3. Patofisiologi (Mekanisme)
4. Manifestasi Klinis
5. Tata Laksana
6. Komplikasi & Prognosis`;

export const MODE_STRUCTURES: Record<NoteMode, string> = {
  [NoteMode.GENERAL]: `## 1. Definisi & Epidemiologi
## 2. Etiologi & Faktor Risiko
## 3. Patofisiologi (Mekanisme Utama)
## 4. Manifestasi Klinis (Tanda & Gejala)
## 5. Pemeriksaan Penunjang (Labs & Rads)
## 6. Diagnosis Banding
## 7. Tata Laksana (Farmako & Non-Farmako)
## 8. Komplikasi & Prognosis`,

  [NoteMode.CHEAT_CODES]: `## ⚡ High-Yield Triad (Must Know)
- Definisi cepat & Kata Kunci (Buzzwords) vignette soal.
- Tanda kardinal utama.

## 🧠 Mnemonics & Memory Hooks
- Jembatan keledai untuk gejala/kriteria.
- Asosiasi visual cepat.

## 🚨 Red Flags & Contraindications
- Hal yang membahayakan nyawa (Life-threatening).
- Obat/Tindakan yang DILARANG keras.

## 🆚 Rapid Differential Table
- Tabel perbandingan cepat: Penyakit ini vs Kemiripan terdekat.
- Fokus pada: Key Distinguishing Feature.

## 💊 Pharmacotherapy Speed-Run
- Nama Obat | Golongan | Target Mekanisme | Efek Samping Utama.
- Tanpa dosis detail, fokus pada mekanisme aksi.`,

  [NoteMode.FIRST_PRINCIPLES]: `## 🧬 Molecular Origin (The Root Cause)
- Apa defek fundamental pada level sel/molekul?
- Reseptor/Enzim apa yang terganggu?

## ⚙️ Pathophysiological Cascade
- Runtutan logis dari A -> B -> C (Gunakan Mermaid Flowchart).
- Jelaskan hukum fisika/biokimia yang berlaku (misal: Hukum Starling, Siklus Krebs).

## ⚖️ Homeostatic Compensation
- Bagaimana tubuh mencoba menyeimbangkan gangguan ini?
- Mengapa kompensasi ini akhirnya gagal?

## 🔬 Derivation of Clinical Signs
- "Mengapa gejala X muncul?" (Diturunkan dari mekanisme, bukan hafalan).
- Hubungan langsung antara patologi jaringan dengan keluhan pasien.

## 🎯 Mechanism-Based Management
- Jelaskan MENGAPA obat ini dipilih berdasarkan target molekulernya.
- Korelasi mekanisme obat dengan pembalikan patofisiologi.`,

  [NoteMode.FEYNMAN]: `## 💡 The "Big Idea"
- Ringkasan satu kalimat yang menangkap esensi topik ini.
- "Jika saya harus menjelaskan ini di pesta makan malam..."

## 🍎 The Core Analogy (Real World Mapping)
- Gunakan analogi dunia nyata (misal: Jantung sebagai pompa air, Ginjal sebagai filter kopi).
- Petakan komponen medis ke komponen analogi.

## 👶 ELI5: The Narrative Explanation
- Penjelasan naratif sederhana seolah mengajar pemula.
- Hindari jargon tanpa penjelasan langsung.

## 🔄 The "But Why?" Chain
- Pertanyaan berulang untuk menggali kedalaman.
- Q: Kenapa terjadi X? A: Karena Y. -> Q: Tapi kenapa Y? A: Karena Z.

## 🛑 Common Misconceptions
- Apa yang sering salah dipahami orang tentang topik ini?
- Koreksi intuitif.`,

  [NoteMode.SOCRATIC]: `## ❓ Core Question 1: Fundamental Concept
- Question: Apa hakikat dasar dari kondisi ini?
- [Hidden Answer]: Definisi konseptual mendalam.

## ❓ Core Question 2: Underlying Mechanism
- Question: Mekanisme spesifik apa yang memicu kaskade kejadian ini?
- [Hidden Answer]: Penjelasan patofisiologi kausal.

## ❓ Core Question 3: Diagnostic Logic
- Question: Data apa yang mutlak diperlukan untuk diagnosis pasti dan mengapa?
- [Hidden Answer]: Gold standard diagnosis & reasoning.

## ❓ Core Question 4: Therapeutic Justification
- Question: Mengapa regimen terapi X lebih superior dibanding Y pada kasus ini?
- [Hidden Answer]: Farmakodinamik dan EBM reasoning.

## 🧪 Clinical Vignette Challenge
- Studi kasus singkat untuk menguji pemahaman.
- Solusi dan Pembahasan.`
};