import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from '@/lib/supabaseClient';

const MODEL_ID = 'gemini-2.5-flash';

const ALLOWED_CATEGORIES = ['Fire', 'Medical', 'Police', 'Natural Disaster'];
const ALLOWED_PRIORITIES = ['High', 'Medium', 'Low'];
const ALLOWED_TEAMS = ['Police', 'Ambulance', 'Firefighters'];

const TRIAGE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      format: 'enum',
      enum: ALLOWED_CATEGORIES,
      description: 'Primary emergency category for dispatch routing.',
    },
    priority: {
      type: Type.STRING,
      format: 'enum',
      enum: ALLOWED_PRIORITIES,
      description: 'Urgency level based on immediate threat to life and property.',
    },
    summary: {
      type: Type.STRING,
      description:
        'One concise English sentence for the dispatcher describing the situation and required response.',
    },
    teamsNeeded: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        format: 'enum',
        enum: ALLOWED_TEAMS,
      },
      description:
        'Multi-team dispatch list. Use only values from the allowed teams enum.',
    },
  },
  required: ['category', 'priority', 'summary', 'teamsNeeded'],
};

const TRIAGE_SYSTEM_INSTRUCTION = `You are an objective emergency operations center (EOC) triage analyst.
Analyze the incident description and return structured dispatch guidance in English only.

Rules:
- Be objective. Never downplay threats, injuries, fire, entrapment, weapons, or mass-casualty indicators.
- Infer situational dependencies from the full text (cause, injuries, fire, traffic, hazards).
- teamsNeeded must contain ONLY these exact strings: "Police", "Ambulance", "Firefighters".
- Include each team only when the description justifies that resource.

Dispatch heuristics (examples):
- Minor traffic issues, fender benders, or requests for traffic control only → ["Police"].
- Vehicle collision with injuries, bleeding, unconscious victims, chest pain, or difficulty breathing → ["Police", "Ambulance"].
- Vehicle fire, smoke in cabin, fuel leak with ignition risk, building fire, or trapped occupants → ["Police", "Ambulance", "Firefighters"].
- Active violent crime or immediate public-safety threat → ["Police"] (add "Ambulance" if injuries are described).
- Medical-only calls without police/fire need → ["Ambulance"] (add "Police" if scene safety or access control is needed).
- Wildfire, flood, earthquake, or structural collapse with casualties → usually all three teams.

category must be one of: Fire, Medical, Police, Natural Disaster.
priority must be one of: High, Medium, Low (High = immediate life threat).`;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenAI({ apiKey });
}

function normalizeTeams(teams) {
  if (!Array.isArray(teams)) return [];
  return teams.filter((team) => ALLOWED_TEAMS.includes(team));
}

function validateTriagePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Triage model returned an invalid payload');
  }

  const { category, priority, summary, teamsNeeded } = payload;

  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category from triage model: ${category}`);
  }
  if (!ALLOWED_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid priority from triage model: ${priority}`);
  }
  if (typeof summary !== 'string' || !summary.trim()) {
    throw new Error('Triage model returned an empty summary');
  }

  const teams = normalizeTeams(teamsNeeded);
  if (teams.length === 0) {
    throw new Error('Triage model returned no valid teams');
  }

  return {
    category,
    priority,
    summary: summary.trim(),
    teamsNeeded: teams,
  };
}

async function runTriage(description) {
  const ai = getGenAIClient();

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Triage this emergency incident description:\n\n${description.trim()}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: TRIAGE_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: TRIAGE_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Empty response from triage model');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Triage model returned non-JSON output');
  }

  return validateTriagePayload(parsed);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const incidentId = body?.incidentId;
    const description =
      typeof body?.description === 'string' ? body.description.trim() : '';

    if (incidentId == null || incidentId === '') {
      return Response.json(
        { error: 'incidentId is required' },
        { status: 400 }
      );
    }

    if (!description) {
      return Response.json(
        { error: 'description is required' },
        { status: 400 }
      );
    }

    const triage = await runTriage(description);

    const { data: incident, error: updateError } = await supabase
      .from('incidents')
      .update({
        category: triage.category,
        priority: triage.priority,
        ai_summary: triage.summary,
        teams_needed: triage.teamsNeeded,
        status: 'processed',
      })
      .eq('id', incidentId)
      .select()
      .single();

    if (updateError) {
      console.error('Supabase update failed:', updateError);
      return Response.json(
        { error: updateError.message || 'Failed to save triage results' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      triage,
      incident,
    });
  } catch (err) {
    console.error('Triage API error:', err);

    return Response.json(
      { error: err?.message || 'Triage failed' },
      { status: 500 }
    );
  }
}
