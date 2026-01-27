// web/src/views/Article/ArticleView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api'; // 假设你已封装好 api.runTool
import ReactMarkdown from 'react-markdown';

const ArticleView = () => {
  const [step, setStep] = useState('IDLE'); // IDLE, OUTLINE, WRITING, DONE
  const [topic, setTopic] = useState('');
  const [outline, setOutline] = useState([]); // [{heading: '', key_points: []}]
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);
  const [aiProvider, setAiProvider] = useState('gemini');
  const [currentSectionIndex, setCurrentSectionIndex] = useState(-1); // -1 表示尚未开始

  const modelConfigs = [
    { 
      id: 'gemini', 
      label: 'Gemini 3.0', 
      sub: '速度与智慧平衡', 
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> 
    },
    { 
      id: 'ollama', 
      label: 'Gemma 3 (Local)', 
      sub: '本地运行 / 私密', 
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg> 
    }
  ];

  // 历史记录相关状态
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('article_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);

  // 自动存入本地存储
  useEffect(() => {
    localStorage.setItem('article_history', JSON.stringify(history));
  }, [history]);

  // 1. 生成大纲
  const generateOutline = async () => {
    if (!topic) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.runTool('article_outline', { 
        question: topic,
        provider: aiProvider 
      });

      let rawData = res.result;
      
      let parsedData = rawData;

      if (typeof rawData === 'string') {
        // 1. 【核心】先移除思考过程，防止干扰 JSON 匹配
        rawData = rawData.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // 2. 【提取】只抓取最外层的大括号内容
        const jsonMatch = rawData.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          rawData = jsonMatch[0];
        }

        try {
          parsedData = JSON.parse(rawData);
        } catch (e) {
          console.warn("JSON 解析失败，尝试修复并二次解析...");
          // 这里调用你之前的 suffixes 补全逻辑
          // rawData = tryFixJson(rawData); 
        }
      }

      const cleanData = (obj) => {
        if (typeof obj === 'string') {
          return obj
            // 移除 Emoji 及特殊符号
            .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '')
            // 移除特定的打卡图标
            .replace(/[✅❌⭐🔥🚀💡💎📈📉]/g, '')
            .trim();
        }
        if (Array.isArray(obj)) return obj.map(cleanData);
        if (typeof obj === 'object' && obj !== null) {
          const newObj = {};
          for (let key in obj) newObj[key] = cleanData(obj[key]);
          return newObj;
        }
        return obj;
      };

      const finalResult = cleanData(parsedData);

      // 递归寻找数组逻辑 (保持不变)
      const findArray = (obj) => {
        if (Array.isArray(obj)) return obj;
        if (typeof obj === 'object' && obj !== null) {
          for (let key in obj) {
            const found = findArray(obj[key]);
            if (found) return found;
          }
        }
        return null;
      };
      const outlineData = findArray(finalResult);
      if (outlineData) {
        setOutline(outlineData);
        setStep('OUTLINE');
        saveToHistory({ outline: outlineData, status: 'DRAFT' }); // 保存大纲到历史
      } else {
        throw new Error("模型未返回有效的大纲数组，请尝试换个主题或重试。");
      }
    } catch (err) {
      setError(`本地模型调用失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 1.1 重新生成某条大纲
  const regenerateSection = async (index) => {
    if (!content.includes('## ')) {
      alert("请先生成全文再进行局部润色");
      return;
    }
    const section = outline[index];
    setLoading(true);
    setProgressText(`正在重新润色章节：${section.heading}...`);
    
    try {
      // 1. 获取上下文：取该章节之前的所有内容
      const parts = content.split(/\n## /);
      // 第一部分是 # Topic，后面每一部分是一个章节
      const context = parts.slice(0, index + 1).join('\n## ').slice(-1200);

      const res = await api.runTool('article_section', {
        question: section.heading,
        context: context,
        // requirements: section.key_points.join('，')
        requirements: `${section.key_points.join('，')}。注意：直接输出正文，不要带有章节序号。` , 
        provider: aiProvider
      });

      // 2. 精确替换
      // parts[0] 是 # Title
      // parts[1] 是 第1章
      // 所以索引为 index 的章节在 parts[index + 1]
      parts[index + 1] = `${section.heading}\n\n${res.result}\n\n`;
      
      const newContent = parts.join('\n## ');
      setContent(newContent);
      
    } catch (err) {
      console.error(err);
      alert(`章节 [${section.heading}] 刷新失败`);
    } finally {
      setLoading(false);
      setProgressText('');
    }
  };


  // 2. 迭代生成全文
  const generateFullContent = async () => {
    setStep('WRITING');
    setLoading(true); // 开启 Loading 状态
    let fullText = `# ${topic}\n\n`;
    
    try {
      for (let i = 0; i < outline.length; i++) {
        setCurrentSectionIndex(i); // 👈 当前正在生成的章节索引
        const section = outline[i];
        setProgressText(`正在撰写第 ${i + 1}/${outline.length} 章: ${section.heading}...`);

        try {
          const previousContext = fullText.length > 500 
            ? `【上文结尾】：...${fullText.slice(-800)}` 
            : "这是文章的开篇章节。";

          const res = await api.runTool('article_section', {
            question: section.heading,
            context: previousContext,
            // requirements: section.key_points.join('，')
            requirements: `${section.key_points.join('，')}。要求：直接撰写正文内容，严禁在正文开头出现“第X章”、“第X节”或重复章节标题，保持深度长文的叙事感。`
          });
          
          const sectionMarkdown = `\n\n## ${section.heading}\n\n${res.result}\n\n`;
          fullText += sectionMarkdown;
          setContent(fullText);

          // --- 丝滑小技巧：自动滚动预览区到底部 ---
          setTimeout(() => {
            const previewArea = document.querySelector('.prose'); // 对应你预览区的类名
            if (previewArea) {
              previewArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
          }, 100);

        } catch (err) {
          console.error(`章节 ${section.heading} 生成失败:`, err);
          fullText += `\n\n> ⚠️ 章节 [${section.heading}] 生成失败。\n\n`;
          setContent(fullText);
        }
      }
      setCurrentSectionIndex(-1); // 👈 生成结束后重置
      setStep('DONE');
      saveToHistory({ content: fullText, status: 'COMPLETED' });
    } catch (globalErr) {
      setError(globalErr.message);
    } finally {
      setLoading(false);
      setProgressText(''); // 👈 统一清理状态，不要用 setLoadingMessage
    }
  };

  // 3. 推送 WordPress
  const [publishLink, setPublishLink] = useState(null); // 存储发布后的链接

  const pushToWP = async () => {
    setLoading(true);
    try {
      const res = await api.publishArticle({
        title: topic,
        content: content,
        excerpt: content.slice(0, 150).replace(/[#*`]/g, '') + '...',
        status: 'publish',
      });

      // 假设 res 结构是 { success: true, result: { link, postId } }
      if (res.success && res.result.link) {
        setPublishLink(res.result.link);
        setStep('DONE');
        saveToHistory({ publishLink: res.result.link, status: 'PUBLISHED' });
      }
    } catch (err) {
      setError(`推送失败：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const moveSection = (index, direction) => {
    const newOutline = [...outline];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOutline.length) return;
    
    [newOutline[index], newOutline[targetIndex]] = [newOutline[targetIndex], newOutline[index]];
    setOutline(newOutline);
  };

  // 重置/开始新会话 模式
  const resetSession = () => {
    if (step !== 'IDLE' && step !== 'DONE') {
      if (!window.confirm('当前创作尚未完成，确定要放弃并开始新会话吗？')) return;
    }
    setStep('IDLE');
    setTopic('');
    setOutline([]);
    setContent('');
    setError(null);
    setPublishLink(null);
    setProgressText('');
  };

  // 保存到历史记录（支持更新已有项或新增）
  const saveToHistory = (overrides = {}) => {
    setHistory(prev => {
      // 1. 寻找是否已有该主题的记录（通过 ID 或 Topic）
      const existingItem = prev.find(h => 
        (overrides.id && h.id === overrides.id) || 
        (topic && h.topic === topic)
      );

      // 2. 构造新条目，优先使用 overrides 传入的最新值，其次使用当前 State
      const newItem = {
        id: overrides.id || existingItem?.id || Date.now(),
        topic: overrides.topic || topic || "未命名主题",
        outline: overrides.outline || outline,
        content: overrides.content || content,
        status: overrides.status || (content ? 'COMPLETED' : 'DRAFT'),
        publishLink: overrides.publishLink || publishLink,
        time: new Date().toLocaleString(),
        ...overrides
      };

      const index = prev.findIndex(h => h.id === newItem.id);
      let newHistory;

      if (index > -1) {
        // 更新
        newHistory = [...prev];
        newHistory[index] = newItem;
      } else {
        // 置顶新增
        newHistory = [newItem, ...prev];
      }

      return newHistory.slice(0, 20); // 仅保留最近20条
    });
  };

  // 从历史加载
  const loadFromHistory = (item) => {
    setTopic(item.topic);
    setOutline(item.outline);
    setContent(item.content || '');
    setPublishLink(item.publishLink || null);
    setStep(item.status === 'DRAFT' ? 'OUTLINE' : 'DONE');
    setShowHistory(false);
    setError(null);
  };

  // 删除单条历史
  const deleteHistoryItem = (e, id) => {
    e.stopPropagation(); // 防止触发加载逻辑
    if (window.confirm('确定删除这条记录吗？')) {
      setHistory(prev => prev.filter(item => item.id !== id));
    }
  };
  
  return (
    <div className="max-w-8xl mx-auto p-6 space-y-6">
      {/* 融合后的头部状态条 */}
      <div className="sticky top-0 z-50 flex justify-between items-center bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-sm border mb-6">
        {/* 左侧：品牌与当前意图 */}
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-sm">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-gray-800 leading-tight">长文智能创作</h1>
            <p className="text-[11px] text-gray-400 font-medium">
              {step === 'IDLE' && "准备开始新的灵感"}
              {step === 'OUTLINE' && "正在打磨文章灵魂"}
              {step === 'WRITING' && "AI 正在全力挥毫中"}
              {step === 'DONE' && "创作已就绪，等待分发"}
            </p>
          </div>
        </div>

        {/* 右侧：状态条 + 功能按钮融合区 */}
        <div className="flex items-center space-x-6">
          
          {/* 步骤指示器 - 放置在中间偏右 */}
          <div className="hidden md:flex items-center space-x-1 border-r pr-6 border-gray-100">
            {[
              { id: 'IDLE', label: '构思' },
              { id: 'OUTLINE', label: '大纲' },
              { id: 'WRITING', label: '生成' },
              { id: 'DONE', label: '发布' }
            ].map((s, idx) => {
              const isActive = ['IDLE', 'OUTLINE', 'WRITING', 'DONE'].indexOf(step) >= idx;
              return (
                <div key={s.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`h-1 w-8 rounded-full transition-all duration-500 ${isActive ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'bg-gray-100'}`} />
                    <span className={`text-[10px] mt-1.5 font-bold ${isActive ? 'text-blue-500' : 'text-gray-300'}`}>{s.label}</span>
                  </div>
                  {idx < 3 && <div className="w-1" />}
                </div>
              );
            })}
          </div>

          {/* 动作按钮组 */}
          <div className="flex items-center space-x-2">
            {/* 历史记录 */}
            <div className="relative">
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg transition-all ${showHistory ? 'bg-blue-50 text-blue-600 shadow-inner' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              {/* 历史记录下拉菜单 - 完整渲染逻辑 */}
              {showHistory && (
                <>
                  {/* 背景遮罩，点击关闭 */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)}></div>
                  
                  <div className="absolute right-0 mt-3 w-80 bg-white border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    {/* 头部 */}
                    <div className="p-3 border-b bg-gray-50/50 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">本地资产历史</span>
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                        {history.length} / 20
                      </span>
                    </div>

                    {/* 列表区 */}
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {history.length === 0 ? (
                        <div className="p-10 text-center flex flex-col items-center justify-center">
                          <svg className="h-8 w-8 text-gray-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          <p className="text-xs text-gray-400">暂无本地存档</p>
                        </div>
                      ) : (
                        history.map((item) => (
                          <div 
                            key={item.id} 
                            onClick={() => loadFromHistory(item)}
                            className="p-3 hover:bg-blue-50/50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors group relative"
                          >
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-sm font-bold text-gray-700 truncate pr-6">
                                {item.topic}
                              </h4>
                              {/* 删除按钮 - 悬停显示 */}
                              <button 
                                onClick={(e) => deleteHistoryItem(e, item.id)}
                                className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"
                                title="删除记录"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                  item.status === 'PUBLISHED' ? 'bg-green-100 text-green-600' : 
                                  item.status === 'COMPLETED' ? 'bg-blue-100 text-blue-600' : 
                                  'bg-amber-100 text-amber-600'
                                }`}>
                                  {item.status === 'PUBLISHED' ? '已发布' : 
                                  item.status === 'COMPLETED' ? '已完成' : '草稿'}
                                </span>
                                <span className="text-[10px] text-gray-300 font-medium">{item.time}</span>
                              </div>
                              
                              {/* 如果是已完成或已发布，展示一个小图标暗示内容完整 */}
                              {item.content && (
                                <div className="text-[10px] text-gray-400 flex items-center">
                                  <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  {Math.round(item.content.length / 2)}字
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* 底部快速清理 */}
                    {history.length > 0 && (
                      <div className="p-2 bg-gray-50 border-t text-center">
                        <button 
                          onClick={() => {
                            if(window.confirm('确定要清空所有历史记录吗？')) {
                              setHistory([]);
                              localStorage.removeItem('article_history');
                            }
                          }}
                          className="text-[10px] text-gray-400 hover:text-red-400 transition"
                        >
                          清空所有历史记录
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 新建会话按钮 */}
            <button 
              onClick={resetSession}
              className="flex items-center px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-all active:scale-95 shadow-md shadow-gray-200"
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建
            </button>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* 左侧：控制与编辑区 */}
        <div className="lg:col-span-1 space-y-4 sticky top-28">
          {/* 模型选择器 */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center px-1">
              <label className="text-sm font-bold text-gray-700">推理引擎</label>
              <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">在线</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {modelConfigs.map((m) => {
                const isSelected = aiProvider === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setAiProvider(m.id)}
                    className={`
                      flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left
                      ${isSelected 
                        ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                      }
                    `}
                  >
                    <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {m.icon}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>{m.label}</div>
                      <div className="text-[9px] text-gray-400 truncate">{m.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {step === 'IDLE' ? (
            /* 保持原样：输入框 */
            <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
              <label className="block text-sm font-medium text-gray-700">文章主题/核心观点</label>
              <textarea 
                className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="输入你想写的深度长文主题..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <button 
                onClick={generateOutline}
                disabled={loading || !topic}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                {loading ? '思考架构中...' : '第一步：策划爆文大纲'}
              </button>
            </div>
            

          ) : (
            /* 核心重构：将 OUTLINE, WRITING, DONE 融合 */
            <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
              
              {/* 优化点 2：常驻展示用户输入的标题 */}
              <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">当前创作主题</h4>
                <h2 className="text-lg font-bold text-gray-800 leading-snug">{topic}</h2>
              </div>

              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-lg text-gray-700">文章大纲及进度</h3>
                {step === 'DONE' && (
                  <div className="flex space-x-2">
                    <button onClick={pushToWP} disabled={loading} className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition">推送 WP</button>
                    <button onClick={() => window.print()} className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600">导出</button>
                  </div>
                )}
              </div>

              {/* 优化点 1：保留展示大纲，根据状态变色 */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                {(Array.isArray(outline) ? outline : []).map((item, idx) => {
                  // 定义状态逻辑
                  const isGenerating = step === 'WRITING' && currentSectionIndex === idx;
                  const isFinished = (step === 'WRITING' && idx < currentSectionIndex) || step === 'DONE';
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-lg border transition-all duration-300 ${
                        isGenerating ? 'border-blue-500 bg-blue-50 shadow-md' : 
                        isFinished ? 'border-green-200 bg-green-50/40' : 
                        'bg-gray-50 border-gray-100'
                      } group relative flex items-center justify-between`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          {/* 状态图标/序号 */}
                          {isFinished ? (
                            <div className="bg-green-500 rounded-full p-0.5 shadow-sm shadow-green-200">
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isGenerating ? 'bg-blue-500 text-white animate-pulse' : 'bg-blue-100 text-blue-600'}`}>
                              #{idx + 1}
                            </span>
                          )}
                          
                          {/* 编辑模式仅在 OUTLINE 阶段开启 */}
                          {step === 'OUTLINE' ? (
                            <div className="flex-1 min-w-0">
                              <input 
                                className="font-semibold bg-transparent w-full outline-none focus:text-blue-700"
                                value={item.heading}
                                onChange={(e) => {
                                  const newOutline = [...outline];
                                  newOutline[idx].heading = e.target.value;
                                  setOutline(newOutline);
                                }}
                              />
                              <input 
                                className="text-xs text-gray-400 mt-0.5 italic bg-transparent w-full outline-none"
                                value={item.key_points.join(' / ')}
                                onChange={(e) => {
                                  const newOutline = [...outline];
                                  newOutline[idx].key_points = e.target.value.split(/[，,/ /]/);
                                  setOutline(newOutline);
                                }}
                              />
                            </div>
                          ) : (
                            <span className={`font-semibold truncate ${isFinished ? 'text-green-800' : isGenerating ? 'text-blue-700' : 'text-gray-600'}`}>
                              {item.heading}
                            </span>
                          )}
                        </div>

                        {/* 生成过程中的蓝色进度条 */}
                        {isGenerating && (
                          <div className="mt-2 w-full bg-blue-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full animate-progress-loading"></div>
                          </div>
                        )}
                      </div>
                      
                      {/* 操作按钮组：根据不同阶段展示不同功能 */}
                      <div className="flex items-center space-x-1 ml-4">
                        {step === 'OUTLINE' && (
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex flex-col border-r pr-1 border-gray-200">
                              <button onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="p-0.5 hover:text-blue-600 disabled:text-gray-200">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                              <button onClick={() => moveSection(idx, 1)} disabled={idx === outline.length - 1} className="p-0.5 hover:text-blue-600 disabled:text-gray-200">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            </div>
                            <button onClick={() => setOutline(outline.filter((_, i) => i !== idx))} className="p-1.5 text-gray-400 hover:text-red-500">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        )}
                        {step === 'DONE' && (
                          <button 
                            onClick={() => regenerateSection(idx)}
                            disabled={loading}
                            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition"
                            title="重新润色该章节"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 底部按钮区 */}
              {step === 'OUTLINE' && (
                <div className="space-y-3">
                  <button 
                    onClick={() => setOutline([...outline, { heading: '新章节', key_points: [] }])}
                    className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 rounded-lg text-sm hover:border-blue-300 hover:text-blue-500 transition"
                  >
                    + 添加自定义章节
                  </button>
                  <div className="flex space-x-3">
                    <button onClick={() => setStep('IDLE')} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">重写主题</button>
                    <button onClick={generateFullContent} className="flex-[2] px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 shadow-lg shadow-green-100 transition">确认大纲，开始扩写</button>
                  </div>
                </div>
              )}

              {/* 加载状态指示 */}
              {loading && progressText && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center space-x-3 animate-in fade-in zoom-in-95">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                  <span className="text-sm text-blue-600 font-medium">{progressText}</span>
                </div>
              )}
            </div>
          )}

          {/* 发布成功的反馈卡片 (放在大容器外面作为补充) */}
          {publishLink && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-green-500 p-3 rounded-full shadow-lg shadow-green-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-green-800">资产入库成功！</h3>
                    <p className="text-sm text-green-600">深度长文已正式推送到您的 WordPress 官网。</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPublishLink(null)}
                  className="text-green-400 hover:text-green-600 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a 
                  href={publishLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-2 bg-white border border-green-200 text-green-700 rounded-lg hover:bg-green-100 hover:border-green-300 transition shadow-sm font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  立即预览文章
                </a>
                
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(publishLink);
                    alert('链接已复制到剪贴板');
                  }}
                  className="flex items-center px-4 py-2 bg-white border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition shadow-sm font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  复制文章地址
                </button>
              </div>

              {/* 扩展：资产分发区 */}
              <div className="mt-6 pt-4 border-t border-green-100">
                <p className="text-[10px] uppercase tracking-widest text-green-400 font-bold mb-3">多平台复用 (Coming Soon)</p>
                <div className="flex space-x-4 opacity-50 cursor-not-allowed">
                  <span className="flex items-center text-xs text-green-600 bg-green-100 px-2 py-1 rounded">知乎回答</span>
                  <span className="flex items-center text-xs text-green-600 bg-green-100 px-2 py-1 rounded">小红书文案</span>
                  <span className="flex items-center text-xs text-green-600 bg-green-100 px-2 py-1 rounded">公众号适配</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：预览区 */}
        <div className="lg:col-span-2">
          <div className="bg-white p-8 rounded-xl border shadow-sm min-h-[600px] prose prose-blue max-w-none">
            {content ? (
              <ReactMarkdown>{content}</ReactMarkdown>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <span className="text-6xl mb-4">✍️</span>
                <p>文章内容将在这里实时呈现</p>
              </div>
              
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default ArticleView;