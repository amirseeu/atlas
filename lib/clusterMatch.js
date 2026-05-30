import { Type } from '@google/genai';
import { GEMINI_MODEL_ID, getGenAIClient } from './geminiClient';

const MATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    match: {
      type: Type.BOOLEAN,
      description:
        'True only if both reports describe the same real-world emergency event.',
    },
    reasoning: {
      type: Type.STRING,
      description: 'Brief English explanation for the dispatcher.',
    },
  },
  required: ['match', 'reasoning'],
};

const MATCH_SYSTEM_INSTRUCTION = `You are an emergency dispatch analyst comparing two citizen reports.
Determine whether they describe the SAME real-world event (not merely the same GPS area).

Rules:
- Match TRUE when narratives describe the same incident (e.g. "car accident on Route 4" and "two vehicles crashed on Highway 4").
- Match FALSE when events differ despite proximity (e.g. "heart attack in apartment 3B" vs "fender bender on the street outside").
- Match FALSE when categories clearly conflict (medical emergency vs traffic collision) unless text explicitly links them.
- Be objective; do not merge unrelated simultaneous emergencies at one location.
- Respond in English only.`;

function reportLabel(incident) {
  const category =
    incident.category || incident.title || 'Unknown category';
  const description = incident.description || 'No description';
  return { category, description };
}

/**
 * Ask Gemini whether two reports are the same macro-incident.
 * @returns {Promise<{ match: boolean, reasoning: string }>}
 */
export async function evaluateSameEvent(incidentA, incidentB) {
  const a = reportLabel(incidentA);
  const b = reportLabel(incidentB);

  const ai = getGenAIClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL_ID,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Report A
Category: ${a.category}
Description: ${a.description}

Report B
Category: ${b.category}
Description: ${b.description}

Do these describe the same emergency event?`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: MATCH_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: MATCH_RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Empty response from cluster match model');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Cluster match model returned non-JSON output');
  }

  return {
    match: Boolean(parsed.match),
    reasoning:
      typeof parsed.reasoning === 'string'
        ? parsed.reasoning.trim()
        : 'No reasoning provided.',
  };
}
