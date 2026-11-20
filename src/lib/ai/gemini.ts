import 'server-only';
import { z } from 'zod';

// Google AI Studio key (free tier available): https://aistudio.google.com/apikey
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest';
const TIMEOUT_MS = 30_000; // 3 attempts + backoff stay inside a 120 s maxDuration
const ATTEMPTS = 3;

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  let lastErr: Error = new Error('Gemini request failed');
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      }
      lastErr = new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      // Retry only transient overload / rate-limit errors.
      if (res.status !== 429 && res.status !== 503 && res.status !== 500) throw lastErr;
    } catch (e) {
      lastErr = (e as Error).name === 'AbortError' ? new Error('Gemini timed out') : (e as Error);
      if (!/timed out|Gemini (429|500|503)|fetch failed/.test(lastErr.message)) throw lastErr;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw lastErr;
}

async function geminiJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const text = await callGemini(prompt);
  return schema.parse(JSON.parse(text));
}

const strList = (max: number) => z.array(z.string()).default([]).transform((a) => a.slice(0, max));

const IssueScout = z.object({
  summary: z.string(),
  difficulty: z.enum(['trivial', 'easy', 'medium', 'hard']).catch('medium'),
  estimatedHours: z.coerce.number().catch(4),
  likelyFiles: strList(8),
  acceptanceCriteria: strList(6),
  agentFriendly: z.boolean().catch(false),
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
  criteriaMet: z.boolean().catch(false),
  score: z.coerce.number().min(0).max(100).catch(0),
  risks: strList(6),
  slopSignals: strList(6),
});

export async function reviewDiff(input: { criteria: string; diff: string; title: string }) {
  try {
    const r = await geminiJson(
      `Review this pull request diff strictly against the acceptance criteria. Be sceptical.
Return JSON: criteriaMet (bool), score (0-100), risks (security/regression risks), slopSignals
(signs of low-effort AI output: unrelated file churn, invented APIs, deleted tests, comments that restate code).
ACCEPTANCE CRITERIA:\n${input.criteria}\nPR TITLE: ${input.title}\nDIFF:\n${input.diff}`,
      Review,
    );
    return { model: MODEL, ...r };
  } catch (e) {
    // Never block a PatchProof on the AI: record an honest "unavailable" review
    // (score 0, criteria not met) that the maintainer sees, and can refresh later.
    return {
      model: MODEL,
      criteriaMet: false,
      score: 0,
      risks: [`AI review unavailable: ${(e as Error).message.slice(0, 120)}. Use "Refresh proof" to retry.`],
      slopSignals: [],
    };
  }
}
