import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON body parsing with high limit for large base64 image payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let aiClient: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required. Configure it in Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// High-fidelity Document OCR endpoint using Gemini 3.5 Flash
app.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Missing image parameter' });
    }

    // Extract raw base64 and mime type
    let mimeType = 'image/jpeg';
    let base64Data = image;
    if (image.startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: 'Perform a high-fidelity document OCR. Identify every word or line of text visible. Return the full text in \'fullText\' and each line with its bounding box in \'lines\'. The \'boundingBox\' must be [ymin, xmin, ymax, xmax] on a scale of 0 to 1000 (where 0 is top/left and 1000 is bottom/right). Be extremely accurate with coordinates, mapping them precisely to the text. Capture all visible text in the image.',
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fullText: {
              type: Type.STRING,
              description: 'The full clean text content of the document.',
            },
            lines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: {
                    type: Type.STRING,
                    description: 'The text content of this single line.',
                  },
                  boundingBox: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.INTEGER,
                    },
                    description: 'The [ymin, xmin, ymax, xmax] coordinates normalized to 0-1000.',
                  },
                },
                required: ['text', 'boundingBox'],
              },
            },
          },
          required: ['fullText', 'lines'],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      return res.status(500).json({ error: 'Gemini returned an empty response' });
    }

    const jsonResult = JSON.parse(resultText);
    res.json(jsonResult);
  } catch (error: any) {
    console.error('OCR API Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error during OCR process.' });
  }
});

// Configure Vite middleware in development, serve static in production
async function configureServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

configureServer();
