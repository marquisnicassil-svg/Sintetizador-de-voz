import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === 'GEMINI_API_KEY_MISSING') {
    return {
      status: 503,
      message:
        'Chave GEMINI_API_KEY não configurada no painel Settings > Secrets do ambiente.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403')) {
    return {
      status: 403,
      message:
        'Chave de API inválida ou sem permissão. Verifique Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Limite de requisições atingido no momento. Aguarde alguns segundos e tente novamente.',
    };
  }
  return {
    status: 500,
    message: `Erro ao consultar a IA: ${raw}`,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Allow cross-origin requests from GitHub Pages or Capacitor Android APK when configured
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'VozSynth Android API' });
  });

  // AI Voice Script & Pronunciation Assistant
  app.post('/api/ai/assist', async (req, res) => {
    try {
      const {
        message,
        currentText = '',
        mode = 'chat',
        targetLang = 'pt-BR',
        history = [],
      } = req.body as {
        message?: string;
        currentText?: string;
        mode?: string;
        targetLang?: string;
        history?: { role: string; text: string }[];
      };

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Envie uma instrução ou pergunta para a IA.' });
        return;
      }

      const ai = getAiClient();

      const systemInstruction = [
        'Você é o Assistente de Voz IA integrado ao aplicativo VozSynth Android.',
        'Responda sempre em Português do Brasil de forma direta, prática e otimizada para leitura em celular.',
        'Seu papel é ajudar o usuário a criar roteiros de locução, melhorar textos para síntese de voz (TTS), sugerir pausas naturais usando exatamente a tag [pausa 400ms] (ou outros valores em ms como [pausa 600ms]), traduzir textos e sugerir correções fonéticas para siglas.',
        'Sempre que produzir ou melhorar um texto pronto para ser falado no sintetizador, coloque esse texto limpo no campo "suggestedScript" (sem markdown, pronto para o TTS ler).',
        'Quando identificar siglas ou palavras estrangeiras difíceis para voz em português, inclua pares {from, to} em "pronunciationSuggestions".',
      ].join(' ');

      const contextLines: string[] = [];
      if (currentText.trim()) {
        contextLines.push(`Texto atual no estúdio do usuário:\n"""\n${currentText.trim()}\n"""`);
      }
      if (mode === 'optimize') {
        contextLines.push(
          'Tarefa: Reescreva o texto atual para soar extremamente natural em síntese de voz, adicionando pontuação fluida e marcadores [pausa Xms] onde fizer sentido.'
        );
      } else if (mode === 'translate') {
        contextLines.push(`Tarefa: Traduza e adapte para leitura falada natural no idioma ${targetLang}.`);
      } else if (mode === 'script') {
        contextLines.push('Tarefa: Crie um roteiro pronto para locução de acordo com o pedido.');
      } else if (mode === 'dialogue') {
        contextLines.push(
          'Tarefa: Crie um diálogo curto entre dois locutores (Locutor 1: ... e Locutor 2: ...) para ser sintetizado em modo podcast/diálogo.'
        );
      }

      if (Array.isArray(history) && history.length > 0) {
        const recent = history
          .slice(-6)
          .map((h) => `${h.role === 'user' ? 'Usuário' : 'IA'}: ${h.text}`)
          .join('\n');
        contextLines.push(`Histórico recente da conversa:\n${recent}`);
      }

      contextLines.push(`Pedido do usuário: ${message.trim()}`);

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contextLines.join('\n\n'),
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Explicação ou resposta curta e amigável ao usuário em português.',
              },
              suggestedScript: {
                type: Type.STRING,
                description:
                  'Texto/roteiro completo pronto para enviar ao sintetizador de voz (opcional, deixe vazio se for apenas uma dúvida geral).',
              },
              pronunciationSuggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    from: { type: Type.STRING },
                    to: { type: Type.STRING },
                  },
                },
                description: 'Sugestões opcionais de pronúncia fonética para o dicionário.',
              },
            },
            required: ['reply'],
          },
        },
      });

      const rawJson = (response.text ?? '{}').trim();
      let parsed: {
        reply?: string;
        suggestedScript?: string;
        pronunciationSuggestions?: { from: string; to: string }[];
      } = {};
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        parsed = { reply: rawJson || 'Aqui está a sugestão gerada.' };
      }

      res.json({
        reply: parsed.reply || 'Pronto! Veja a sugestão abaixo.',
        suggestedScript: parsed.suggestedScript || '',
        pronunciationSuggestions: Array.isArray(parsed.pronunciationSuggestions)
          ? parsed.pronunciationSuggestions
          : [],
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // Gemini Neural Multi-Voice TTS Endpoint
  app.post('/api/ai/tts', async (req, res) => {
    try {
      const {
        text,
        voiceName = 'Kore',
        style = 'Natural, claro e expressivo em português brasileiro',
        dualSpeaker = false,
        secondVoiceName = 'Puck',
        secondStyle = 'Entusiasmado, articulado e conversacional',
        secondText = '',
      } = req.body as {
        text?: string;
        voiceName?: string;
        style?: string;
        dualSpeaker?: boolean;
        secondVoiceName?: string;
        secondStyle?: string;
        secondText?: string;
      };

      const cleanText = (text || '').replace(/\[pausa\s+(\d+)\s*ms\]/gi, '... ').trim();
      if (!cleanText) {
        res.status(400).json({ error: 'Digite um texto para sintetizar na voz neural.' });
        return;
      }

      const ai = getAiClient('v1beta');

      if (dualSpeaker && secondText.trim()) {
        const cleanSecond = secondText.replace(/\[pausa\s+(\d+)\s*ms\]/gi, '... ').trim();
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Voz A: ${cleanText}`,
                  speechMetadata: {
                    speaker: 'Voz A',
                    style,
                  },
                },
                {
                  text: `Voz B: ${cleanSecond}`,
                  speechMetadata: {
                    speaker: 'Voz B',
                    style: secondStyle,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: 'Voz A',
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName },
                    },
                  },
                  {
                    speaker: 'Voz B',
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: secondVoiceName },
                    },
                  },
                ],
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          res.status(502).json({ error: 'A IA não retornou áudio para o diálogo.' });
          return;
        }
        res.json({
          audioBase64: base64Audio,
          mimeType: 'audio/wav',
          modelUsed: 'gemini-3.8-flash-tts',
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'Não foi possível gerar o áudio neural.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        modelUsed: 'gemini-3.8-flash-lite-tts',
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VozSynth Android server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
