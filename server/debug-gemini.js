import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Using Key:", apiKey?.substring(0, 10) + "...");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 尝试列出所有可用模型，这是排查 404 的最好方法
  try {
    // 注意：这里的 listModels 接口如果也 404，说明 Key 权限彻底有问题
    console.log("正在尝试调用 Gemini...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("你好，请回复'连接成功'");
    console.log("✅ 响应成功:", result.response.text());
  } catch (e) {
    console.error("❌ 依然报错:", e.message);
    console.error("错误详情:", JSON.stringify(e, null, 2));
  }
}

test();