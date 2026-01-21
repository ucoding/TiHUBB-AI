// server/ollama.js # 只负责调模型

import fetch from 'node-fetch';

const OLLAMA_API = 'http://127.0.0.1:11434/api/generate';

export async function runOllama({
  model,
  prompt,
  temperature = 0.7
}) {
  const res = await fetch(OLLAMA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature }
    })
  });

  if (!res.ok) {
    throw new Error('Ollama request failed');
  }

  const data = await res.json();
  return data.response;
}
