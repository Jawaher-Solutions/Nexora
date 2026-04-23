// lib/gemini.ts
// RULE: This file ONLY initializes and exports the Gemini AI client singleton.
// Used by the moderation worker for content analysis.

import { env } from '../config/env';

export interface GeminiAnalysisResult {
  isViolation: boolean;
  confidenceScore: number;
  categories: {
    nudity: number;
    violence: number;
    hateSpeech: number;
    illegalActivity: number;
  };
  rawResponse: string;
}

// Gemini API base URL
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Analyze video frames using Gemini Vision API for content moderation.
 * This function will be called by the moderation worker.
 */
export async function analyzeContentWithGemini(
  imageBase64Frames: string[]
): Promise<GeminiAnalysisResult> {
  const prompt = `You are a content moderation AI. Analyze the following video frames for policy violations.
Rate each category from 0-100 (confidence percentage):
- nudity: Sexual or explicit content
- violence: Graphic violence or gore
- hateSpeech: Hate speech indicators, slurs, or discriminatory symbols
- illegalActivity: Drug use, weapons, or illegal activities

Respond ONLY in this exact JSON format:
{
  "nudity": <number>,
  "violence": <number>,
  "hateSpeech": <number>,
  "illegalActivity": <number>
}`;

  const parts = [
    { text: prompt },
    ...imageBase64Frames.map(frame => ({
      inline_data: {
        mime_type: 'image/jpeg',
        data: frame,
      },
    })),
  ];

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
      }),
    }
  );

  const data = await response.json();
  const rawResponse = JSON.stringify(data);

  try {
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const categories = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');

    const maxScore = Math.max(
      categories.nudity ?? 0,
      categories.violence ?? 0,
      categories.hateSpeech ?? 0,
      categories.illegalActivity ?? 0
    );

    return {
      isViolation: maxScore > 40,
      confidenceScore: maxScore,
      categories: {
        nudity: categories.nudity ?? 0,
        violence: categories.violence ?? 0,
        hateSpeech: categories.hateSpeech ?? 0,
        illegalActivity: categories.illegalActivity ?? 0,
      },
      rawResponse,
    };
  } catch {
    return {
      isViolation: false,
      confidenceScore: 0,
      categories: { nudity: 0, violence: 0, hateSpeech: 0, illegalActivity: 0 },
      rawResponse,
    };
  }
}
