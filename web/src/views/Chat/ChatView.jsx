// web/src/view/Chat/ChatView.jsx
import React, { useState, useRef, useEffect } from 'react';
import MessageItem from './MessageItem';

const ChatView = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);
  const isInitialMount = useRef(true); // 用于标记是否是初次加载
  const [skillContent, setSkillContent] = useState('');
  const [skillName, setSkillName] = useState(''); // 新增：存储文件名
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 1. 初始化加载
  useEffect(() => {
    // 读取持久化的聊天记录
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      setMessages(JSON.parse(saved));
    }
    // 读取持久化的技能文档
    const savedSkill = localStorage.getItem('chat_skill_content');
    if (savedSkill) {
      setSkillContent(savedSkill);
    }
    const savedSkillName = localStorage.getItem('chat_skill_name');
    if (savedSkillName) setSkillName(savedSkillName);
  }, []);

  // 2. 监听消息变化：执行保存和滚动
  useEffect(() => {
    // 只有在消息真正增加时才操作
    if (messages.length > 0) {
      localStorage.setItem('chat_history', JSON.stringify(messages));
      
      // 如果是刚打开页面加载的历史，可以使用 auto 瞬间滚动，新消息用 smooth
      const behavior = isInitialMount.current ? 'auto' : 'smooth';
      scrollRef.current?.scrollIntoView({ behavior });
      
      isInitialMount.current = false;
    }
  }, [messages]);

  // 2.1 监听Skill内容文件变化
  useEffect(() => {
    if (skillContent) {
      localStorage.setItem('chat_skill_content', skillContent);
    } else {
      // 如果 skillContent 为空（点击了移除），则从本地存储中彻底删除
      localStorage.removeItem('chat_skill_content');
    }
  }, [skillContent]);

  // 3. 清空功能（既然要做常用会话，这个必不可少）
  const handleReset = () => {
    // 如果当前没有消息，直接返回，避免弹出无意义的确认框
    if (messages.length === 0 && !isLoading) return;

    const confirmMsg = isLoading 
      ? '当前正在生成回复，确定要停止并开启新对话吗？' 
      : '确定要清空当前对话并开启新篇章吗？';

    if (window.confirm(confirmMsg)) {
      // 1. 如果有正在运行的流，可以在这里处理中止逻辑 (可选)
      // if (controllerRef.current) controllerRef.current.abort();

      // 2. 清空 UI 状态
      setMessages([]);
      setIsLoading(false);

      // 3. 清除持久化存储
      localStorage.removeItem('chat_history');
      
      // 4. 给出反馈（可选）
      console.log('会话已重置');
    }
  };

  const textareaRef = useRef(null);

  const handleSend = async (overrideContent = null, overrideHistory = null) => {
    let textToSend = (typeof overrideContent === 'string') ? overrideContent : input;
    textToSend = String(textToSend || "");
    if (!textToSend.trim() || isLoading) return;

    // 构造带 Skill 的 System Prompt
    const systemMsg = {
      role: 'system',
      content: skillContent 
        ? `你是一个严格执行以下技能标准的助手：\n\n${skillContent}`
        : '你是一个专业的本地AI助手。'
    };

    const history = overrideHistory || messages;
    const userMsg = { role: 'user', content: textToSend };
    const currentMessages = [systemMsg, ...history, userMsg]; // 注入 Skill、历史、用户消息

    if (!overrideContent) setInput('');
    setIsLoading(true);
    if (!overrideContent) {
      setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }]);
    } else {
      setMessages(() => [...history, userMsg, { role: 'assistant', content: '' }]);
    }

    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    
    try {
      const response = await fetch('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: currentMessages, // 使用锁定的数组
          model: 'gemma3:12b' 
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); // 处理 SSE 格式 (data: {...}\n\n)
        buffer = lines.pop() || ''; // 保留最后一行未完成的数据

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assistantContent += data.content;
                // 实时更新最后一条消息
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = assistantContent;
                  return newMsgs;
                });
              } 
            } catch (e) {
              console.warn("SSE JSON Parse Error", e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    // 1. 检查是否正在使用输入法 (Composition Session)
    // 防止中文输入法选词回车时误发送
    if (e.nativeEvent.isComposing) return;

    // 2. 逻辑：Enter 发送，Shift + Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // 阻止默认的换行行为
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    
    // 动态计算高度
    e.target.style.height = 'auto'; // 先重置，才能拿到准确的 scrollHeight
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; 
  };

  const exportToMarkdown = () => {
    // 1. 过滤掉内容为空的消息（包括只有空格的消息）
    const validMessages = messages.filter(msg => msg.content && msg.content.trim() !== '');

    if (validMessages.length === 0) {
      alert("没有有效的聊天内容可供导出");
      return;
    }

    // 2. 构建 Markdown 内容
    let content = `# 聊天记录导出\n\n`;
    content += `导出时间: ${new Date().toLocaleString()}\n`;
    if (skillName) content += `使用技能: ${skillName}\n`; 
    content += `\n---\n\n`;

    validMessages.forEach((msg) => {
      const roleName = msg.role === 'user' ? '👤 **User**' : '🤖 **Assistant**';
      content += `${roleName}:\n\n${msg.content}\n\n---\n\n`;
    });

    // 3. 创建 Blob 并下载
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().getTime()}.md`;
    document.body.appendChild(a); // 兼容性更好：先添加到 body
    a.click();
    document.body.removeChild(a); // 下载完移除

    URL.revokeObjectURL(url);
  };

  // 部定义一个状态存储 Skill 内容
  
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:3000/api/upload-skill', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      // 1. 更新状态
      setSkillContent(data.content);
      setSkillName(file.name); // 保存文件名
      
      // 2. 持久化到本地
      localStorage.setItem('chat_skill_content', data.content);
      localStorage.setItem('chat_skill_name', file.name);
      
      alert(`技能【${file.name}】已加载！`);
    } catch (err) {
      alert('上传失败');
    } finally {
      // 清空 input，确保同一个文件删除后再次上传能触发 onChange
      e.target.value = '';
    }
  };

  const handleRemoveSkill = () => {
    setSkillContent('');
    setSkillName('');
    localStorage.removeItem('chat_skill_content');
    localStorage.removeItem('chat_skill_name');
  };

  const handleRegenerate = async () => {
    if (messages.length < 2 || isLoading) return;

    // 1. 找到最后一条用户消息
    // 我们从后往前找，因为最后一条通常是 assistant 的空/旧回复
    const reversedMessages = [...messages].reverse();
    const lastUserMsg = reversedMessages.find(m => m.role === 'user');
    const lastUserMsgIndex = messages.findLastIndex(m => m.role === 'user');

    if (!lastUserMsg) return;

    // 2. 准备“干净”的历史：即最后一条用户消息之前的所有内容
    const cleanHistory = messages.slice(0, lastUserMsgIndex);

    // 3. 触发重新发送：传入最后一次用户说的话，以及那之前的历史
    await handleSend(lastUserMsg.content, cleanHistory);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-white shadow">

      {/* 视图内部头部 - Sticky Header */}
      <header className="shrink-0 h-14 border-b bg-white/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Gemma 3 (12B)
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* 导出按钮 */}
          <button 
            onClick={exportToMarkdown}
            title="导出为 Markdown"
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {/* 新对话按钮 */}
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-all active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新对话
          </button>
        </div>
      </header>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
        <div className="max-w-4xl mx-auto">
          {messages.map((msg, idx) => (
            <MessageItem 
              key={idx} 
              {...msg} 
              isLast={idx === messages.length - 1} // 判断是否最后一条
              isLoading={isLoading}                // 传入加载状态
              onRegenerate={handleRegenerate}      // 传入处理函数
            />
          ))}
          {isLoading && (
            <div className="text-gray-400 text-sm animate-pulse ml-2">Gemma 正在思考...</div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>
      
      <div className="p-4 border-t bg-white">
        <div className="max-w-4xl mx-auto">
          
          {/* 1. Skill 状态提示栏：仅在有内容时从输入框顶部“长”出来 */}
          {skillContent && (
            <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg animate-in fade-in slide-in-from-bottom-2">

              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-xs font-bold text-blue-600">SKILL MODE: </span>
                {/* 动态显示文件名 */}
                <span className="text-xs text-blue-700 truncate font-medium">
                  {skillName || '未命名文档'}
                </span>
                <span className="text-xs text-blue-700 truncate opacity-80">  自定义技能已生效 </span>
              </div>

              <div className="flex items-center gap-1">
                {/* 预览按钮 */}
                <button 
                  onClick={() => setIsPreviewOpen(true)}
                  className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                  title="查看技能全文"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
                <button 
                  onClick={handleRemoveSkill}
                  className="ml-4 text-blue-400 hover:text-blue-600 p-0.5 rounded-full hover:bg-blue-100 transition-colors"
                  title="移除技能"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

            </div>
          )}

          {/* 2. 输入操作区 */}
          <div className="flex gap-2 items-end">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              hidden 
              accept=".md,.txt" 
            />
            
            {/* 上传按钮：带状态颜色切换 */}
            <button 
              onClick={() => fileInputRef.current.click()}
              className={`shrink-0 p-2.5 rounded-xl border transition-all duration-200 ${
                skillContent 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              }`}
              title={skillContent ? '重新上传技能' : '挂载技能文档 (.md/.txt)'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows="1"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 max-h-40 overflow-y-auto transition-all shadow-sm"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={skillContent ? "按此技能要求提问..." : "问点什么..."}
            />
            
            {/* 发送按钮 */}
            <button 
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="shrink-0 bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl disabled:bg-gray-200 disabled:cursor-not-allowed transition-all shadow-sm font-medium"
            >
              {isLoading ? '...' : '发送'}
            </button>
          </div>
        </div>
      </div>

      {/* 预览模态框 */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* 背景遮罩 */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsPreviewOpen(false)}
          />
          
          {/* 弹窗主体 */}
          <div className="relative bg-white w-full max-w-2xl max-h-[70vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span className="w-2 h-4 bg-blue-600 rounded-full"></span>
                技能文档预览
              </h3>
              <button onClick={() => setIsPreviewOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-600 font-sans leading-relaxed">
                {skillContent}
              </pre>
            </div>
            
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button 
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-black transition-colors text-sm font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChatView;