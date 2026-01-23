// server/providers/gemini.js
export class GeminiProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    // 定义降级顺序：3.0 Flash -> 2.5 Flash -> 1.5 Flash
    this.modelPriority = [
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash"
    ];
  }

  async chat(model, messages) {
    const tryModels = model ? [model, ...this.modelPriority.filter(m => m !== model)] : this.modelPriority;
    let lastError = null;

    for (const modelId of tryModels) {
      try {
        console.log(`[Gemini Run] Attempting with model: ${modelId}`);
        const text = await this._executeRequest(modelId, messages);
        return {
          text: text, // 返回最终文本
          actualModel: `Gemini: ${modelId}` // 标记是云端模型
        };
      } catch (error) {
        lastError = error;
        
        // --- 核心修改：扩大降级触发条件 ---
        const shouldDowngrade = 
          error.message.includes("400") || // 请求错误
          error.message.includes("429") || // 限额
          error.message.includes("quota") || // 限额
          error.message.includes("404") || // 模型不存在
          error.message.includes("503") || // 服务器过载 (你遇到的情况)
          error.message.includes("500") || // 服务器内部错误
          error.message === "QUOTA_OR_EMPTY_RESPONSE"; // 我们自定义的空返回

        if (shouldDowngrade) {
          console.warn(`[Gemini Downgrade] ${modelId} failed (${error.message.substring(0, 30)}...), trying next model in list...`);
          continue; // 触发降级，尝试下一个模型
        }

        // 如果是认证错误 (401/403) 等无法通过换模型解决的问题，直接抛出
        throw error;
      }
    }
    throw new Error(`所有 Gemini 模型尝试完毕均失败。最后错误: ${lastError.message}`);
  }

  async _executeRequest(modelId, messages) {
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const contents = userMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = {
      contents: contents,
      system_instruction: systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${this.apiKey}`;

    // 针对不同版本设置不同的思考配置
    if (modelId.includes('gemini-3')) {
      body.generationConfig.thinkingConfig = {
        includeThoughts: false, // 我们只需要最终结果，不需要 AI 的思考原文
        thinkingLevel: "low"
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorText = `[${response.status}] ${data.error?.message || 'Unknown error'}`;
      // 如果是 503，我们记录一下但交给 chat 方法去处理降级
      console.error(`[Gemini Native Error] ${modelId} -> ${errorText}`);
      throw new Error(errorText);
    }

    // --- 核心修复：处理“只思考不说话”的情况 ---
    try {
      const candidate = data.candidates[0];
      // 如果没有 candidate，或者 content 为空，或者 parts 缺失
      if (!candidate || !candidate.content || Object.keys(candidate.content).length === 0 || !candidate.content.parts) {
          // 这里不要报 Parse Error，而是抛出一个特定错误，触发外层的 modelPriority 降级
          console.warn(`[Gemini Warning] Model ${modelId} returned empty content. Thoughts: ${data.usageMetadata?.thoughtsTokenCount}`);
          throw new Error("QUOTA_OR_EMPTY_RESPONSE"); 
      }

      // 遍历 parts，拼接所有非思考部分的 text
      // Gemini 3 的思考内容通常带有 "thought": true 标志，或者在单独的 part 中
      const textParts = candidate.content.parts
        .filter(part => part.text && !part.thought) 
        .map(part => part.text);

      if (textParts.length > 0) {
        return textParts.join("").trim();
      }

      // 最后的兜底：如果过滤后没东西，强行取第一个有 text 的 part
      const fallbackText = candidate.content.parts.find(p => p.text)?.text;
      if (fallbackText) return fallbackText.trim();
      
      throw new Error("No text found in parts");
    } catch (e) {
      // 如果是触发降级的错误，继续向上抛
      if (e.message === "QUOTA_OR_EMPTY_RESPONSE") throw e;
      console.error("[Gemini Parse Error] Raw Data:", JSON.stringify(data, null, 2));
      throw new Error(`解析数据失败: ${e.message}`);
    }
  }
}