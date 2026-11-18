import 'server-only';
import { z } from 'zod';

// Google AI Studio key (free tier available): https://aistudio.google.com/apikey
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

async function geminiJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return schema.parse(JSON.parse(text));
}

const IssueScout = z.object({
  summary: z.string(),
  difficulty: z.enum(['trivial', 'easy', 'medium', 'hard']),
  estimatedHours: z.number(),
  likelyFiles: z.array(z.string()).max(8),
  acceptanceCriteria: z.array(z.string()).max(6),
  agentFriendly: z.boolean(),
});
export type IssueScoutResult = z.infer<typeof IssueScout>;

export function scoutIssue(input: { repo: string; title: string; body: string; tree: string[] }) {
  return geminiJson(
    `You are a senior maintainer of ${input.repo}. Analyse this GitHub issue for a bounty.
Return JSON with keys: summary (2 sentences), difficulty (trivial|easy|medium|hard), estimatedHours (number),
likelyFiles (paths from the file list only), acceptanceCriteria (testable, max 6), agentFriendly (can an AI coding agent likely solve it alone).
ISSUE TITLE: ${input.title}
ISSUE BODY: ${input.body.slice(0, 8000)}
FILE LIST: ${input.tree.slice(0, 400).join('\n')}`,
    IssueScout,
  );
}

const Review = z.object({
  criteriaMet: z.boolean(),
  score: z.number().min(0).max(100),
  risks: z.array(z.string()).max(6),
  slopSignals: z.array(z.string()).max(6),
});

export async function reviewDiff(input: { criteria: string; diff: string; title: string }) {
  const r = await geminiJson(
    `Review this pull request diff strictly against the acceptance criteria. Be sceptical.
Return JSON: criteriaMet (bool), score (0-100), risks (security/regression risks), slopSignals
(signs of low-effort AI output: unrelated file churn, invented APIs, deleted tests, comments that restate code).
ACCEPTANCE CRITERIA:\n${input.criteria}\nPR TITLE: ${input.title}\nDIFF:\n${input.diff}`,
    Review,
  );
  return { model: MODEL, ...r };
}
