import { GoogleGenAI } from "@google/genai";
import { GenerationConfig, UploadedFile, SyllabusItem } from '../types';
import { getStrictPrompt } from '../utils/prompts';
import { processGeneratedNote } from '../utils/formatter';

export const generateNoteContent = async (
  config: GenerationConfig,
  topic: string,
  structure: string,
  files: UploadedFile[],
  onProgress: (status: string) => void
): Promise<string> => {
  
  const apiKey = config.apiKey || process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API Key is missing. Please enter it in Settings or check environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  onProgress("Checking configurations...");
  const modelName = config.model;

  onProgress(`Connecting to ${modelName} in ${config.mode.toUpperCase()} mode...`);

  try {
    const textPrompt = getStrictPrompt(topic, structure, config.mode);
    
    const parts: any[] = [{ text: textPrompt }];

    if (files && files.length > 0) {
      onProgress(`Processing ${files.length} attachment(s)...`);
      files.forEach(file => {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data
          }
        });
      });
    }

    onProgress("Synthesizing content (High Context Mode)...");
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        temperature: config.temperature,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 65536, 
      }
    });

    const rawText = response.text;

    if (!rawText) {
      throw new Error("Received empty response from AI.");
    }

    onProgress("Formatting & Cleaning Mermaid syntax...");
    const finalContent = processGeneratedNote(rawText);

    return finalContent;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    if (error.message?.includes("429")) {
      throw new Error("Quota Exceeded (429). Please wait a moment.");
    }
    // Handle 404 specifically for clearer UX
    if (error.message?.includes("404")) {
       throw new Error(`Model not found (404). The model '${config.model}' may not be available in your account/region.`);
    }
    throw error;
  }
};

const SYLLABUS_PROMPT = `
  TASK: Analyze the provided Syllabus content (Text/JSON/PDF).
  GOAL: Extract a logical, sequential learning path of specific medical topics.
  
  RULES:
  1. Break down large blocks into single, study-able topics (e.g., "Cardiology" -> "Heart Failure", "Hypertension", "Arrhythmias").
  2. Ignore administrative text (grading, dates, professors).
  3. Return ONLY a raw JSON array of strings. No markdown formatting. No 'json' tags.
  4. Limit to max 50 most important topics if the input is massive.
  
  EXAMPLE OUTPUT FORMAT:
  ["Acute Coronary Syndrome", "Heart Failure Management", "Atrial Fibrillation"]
`;

export const parseSyllabusToTopics = async (
  config: GenerationConfig,
  file: UploadedFile
): Promise<SyllabusItem[]> => {
  const apiKey = config.apiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key required for Syllabus Parsing");

  const ai = new GoogleGenAI({ apiKey });
  // Ensure we use a Gemini model even if user is in Groq mode
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: SYLLABUS_PROMPT },
          {
            inlineData: {
              mimeType: file.mimeType,
              data: file.data
            }
          }
        ]
      },
      config: {
        temperature: 0.2, 
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const topics: string[] = JSON.parse(cleanJson);

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Syllabus Parsing Error", e);
    if (e.message?.includes("404")) {
        throw new Error(`Model '${modelName}' not found. Please check your API key.`);
    }
    throw new Error("Failed to parse syllabus file.");
  }
};

export const parseSyllabusFromText = async (
  config: GenerationConfig,
  rawText: string
): Promise<SyllabusItem[]> => {
  const apiKey = config.apiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key required for Syllabus Parsing");

  const ai = new GoogleGenAI({ apiKey });
  // Ensure we use a Gemini model even if user is in Groq mode
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: `${SYLLABUS_PROMPT}\n\nINPUT TEXT:\n${rawText}` }]
      },
      config: {
        temperature: 0.2, 
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const topics: string[] = JSON.parse(cleanJson);

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Syllabus Text Parsing Error", e);
     if (e.message?.includes("404")) {
        throw new Error(`Model '${modelName}' not found. Please check your API key permissions.`);
    }
    throw new Error("Failed to parse syllabus text. Ensure input is valid text or JSON.");
  }
};