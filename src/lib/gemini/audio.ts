import { env } from '@/lib/env';
import { AppError } from '@/lib/errors/app-error';
import type { TranscribeVoiceMessageInput, VoiceTranscript } from '@/lib/elevenlabs/audio';

// L'API accetta audio inline fino a ~20 MB di richiesta totale: le note vocali
// WhatsApp reali sono molto piu piccole, ma meglio fallire in modo esplicito.
const MAX_INLINE_AUDIO_BYTES = 15 * 1024 * 1024;

const TRANSCRIPTION_PROMPT = [
  'Transcribe this WhatsApp voice note exactly as spoken.',
  'The speaker may use Tunisian Arabic (Darja), French, Modern Standard Arabic, or a mix of them, often with French medical or administrative terms.',
  'Keep each word in the language it was spoken in. Write French words in French spelling. Write Arabic and Darja words in Arabic script.',
  'Write numbers, dates and times as digits when clearly spoken.',
  'Do not translate, summarize, explain or add comments. Output only the transcript text.',
  'If the audio is silent or unintelligible, output exactly: [unintelligible]',
].join('\n');

/**
 * Trascrizione di una nota vocale con Gemini (stessa firma di
 * `transcribeVoiceMessage` di ElevenLabs, quindi la pipeline non cambia).
 * Gemini non restituisce lingua ne confidenza: i campi restano non valorizzati.
 */
export async function transcribeVoiceMessageWithGemini({
  audio,
}: TranscribeVoiceMessageInput): Promise<VoiceTranscript> {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL_FAST || env.GEMINI_MODEL_PRIMARY;

  if (!apiKey || !model) {
    throw new AppError('internal', 'Gemini API key or model is not configured', {
      expose: false,
    });
  }

  if (audio.size > MAX_INLINE_AUDIO_BYTES) {
    throw new AppError('bad_request', 'Voice note is too large to transcribe', { expose: false });
  }

  const mimeType = (audio.type || 'audio/ogg').split(';')[0]?.trim() || 'audio/ogg';
  const data = Buffer.from(await audio.arrayBuffer()).toString('base64');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: TRANSCRIPTION_PROMPT }, { inlineData: { mimeType, data } }] },
        ],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!response.ok) {
    throw new AppError('upstream_error', 'Gemini transcription failed', {
      cause: { status: response.status },
      expose: false,
    });
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join(' ')
    .trim();

  if (!text || text === '[unintelligible]') {
    throw new AppError('upstream_error', 'Gemini returned no transcript', { expose: false });
  }

  return { text };
}
