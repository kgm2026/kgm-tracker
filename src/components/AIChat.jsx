import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { sendChatMessage } from '../utils/aiService';
import { dbGet } from '../utils/api';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

export default function AIChat({ projectId, projectName }) {
  const { T } = useTheme();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryInfo, setRetryInfo] = useState('');
  const [attachedImage, setAttachedImage] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const cachedDataRef = useRef(null);
  const cachedProjectIdRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  // Invalidate cache when project changes
  useEffect(() => {
    if (cachedProjectIdRef.current !== projectId) {
      cachedDataRef.current = null;
      cachedProjectIdRef.current = projectId;
    }
  }, [projectId]);

  const getProjectData = useCallback(async () => {
    if (cachedDataRef.current) return cachedDataRef.current;
    const [materials, payments, contractors] = await Promise.all([
      dbGet('material_purchases', `&project_id=eq.${projectId}&order=num.asc`),
      dbGet('payment_log', `&project_id=eq.${projectId}&order=created_at.asc`),
      dbGet('contractors', `&project_id=eq.${projectId}`),
    ]);
    const projects = await dbGet('projects', `&id=eq.${projectId}`);
    const proj = projects[0] || {};
    const data = { projectName, materials, payments, contractors, totalBudget: proj.budget || 0, budgets: [] };
    cachedDataRef.current = data;
    return data;
  }, [projectId, projectName]);

  // Refresh cache periodically (every 2 minutes while chat is open)
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => { cachedDataRef.current = null; }, 120000);
    return () => clearInterval(interval);
  }, [open]);

  // Invalidate cache immediately when data changes in other tabs
  useEffect(() => {
    const handler = () => { cachedDataRef.current = null; };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, []);

  useRefreshOnMount(["material_purchases", "payment_log", "contractors", "projects"], () => { cachedDataRef.current = null; });

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      setAttachedImage({ preview: result, base64, type: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !attachedImage) || loading) return;

    let userMsg;
    let apiMsg;

    if (attachedImage) {
      const content = [];
      if (text) {
        content.push({ type: 'text', text });
      } else {
        content.push({ type: 'text', text: 'Analyze this image.' });
      }
      content.push({
        type: 'image_url',
        image_url: { url: `data:${attachedImage.type};base64,${attachedImage.base64}` },
      });
      userMsg = { role: 'user', content: text || 'Sent an image', image: attachedImage.preview };
      apiMsg = { role: 'user', content };
    } else {
      userMsg = { role: 'user', content: text };
      apiMsg = { role: 'user', content: text };
    }

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAttachedImage(null);
    if (fileRef.current) fileRef.current.value = '';
    setLoading(true);
    setError('');

    try {
      const projectData = await getProjectData();
      const apiMessages = newMessages.map(m => {
        if (m === userMsg) return apiMsg;
        if (m.role === 'assistant') return { role: 'assistant', content: m.content };
        if (m.role === 'user' && m.apiContent) return m.apiContent;
        return { role: m.role, content: m.content };
      });
      setRetryInfo('');
      const { reply } = await sendChatMessage(apiMessages, projectData, {
        onRetry: (attempt, max, delay) => setRetryInfo(`Retrying (${attempt}/${max})...`),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e.message);
    }
    setRetryInfo('');
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestions = [
    "What's our total spend so far?",
    "Which materials have unpaid balances?",
    "How does spending compare to budget?",
    "Which supplier has the highest purchases?",
    "Analyze this site photo",
  ];

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="AI Assistant"
        style={{
          position: 'fixed',
          bottom: open ? undefined : 24,
          right: 24,
          width: 52,
          height: 52,
          background: T.financial,
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          display: open ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 900,
          transition: 'transform 0.2s ease',
          fontSize: 22,
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <span className="material-symbols-outlined">smart_toy</span>
      </button>

      {/* Chat Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 400,
          height: 560,
          background: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 900,
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          animation: 'scaleIn 0.2s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${T.cardBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.financial }}>smart_toy</span>
              <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: T.text }}>AI Assistant</span>
              <span style={{ fontSize: 10, color: T.textMuted, fontFamily: "'Inter',sans-serif" }}>MiMo V2</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: T.textMuted, display: 'block', marginBottom: 12 }}>psychology</span>
                <p style={{ color: T.textMuted, fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 16 }}>Ask me anything about {projectName}</p>
                <p style={{ color: T.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif", marginBottom: 16 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>image</span> You can also send photos and drawings
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      style={{
                        background: T.navActiveBg,
                        border: `1px solid ${T.cardBorder}`,
                        color: T.textMuted,
                        padding: '8px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: "'Inter',sans-serif",
                      }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}>
                {m.image && (
                  <img src={m.image} alt="Sent" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block', marginBottom: 4 }} />
                )}
                <div style={{
                  background: m.role === 'user' ? T.financial : T.navActiveBg,
                  color: m.role === 'user' ? '#fff' : T.text,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontFamily: "'Inter',sans-serif",
                  lineHeight: 1.5,
                  border: m.role === 'user' ? 'none' : `1px solid ${T.cardBorder}`,
                  borderRadius: 0,
                  whiteSpace: 'pre-wrap',
                }}>{m.content}</div>
              </div>
            ))}

            {loading && (
              <div style={{ alignSelf: 'flex-start' }}>
                <div style={{
                  background: T.navActiveBg,
                  border: `1px solid ${T.cardBorder}`,
                  padding: '10px 14px',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: T.textMuted,
                      animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                  {retryInfo && <span style={{ fontSize: 11, color: T.financial, fontFamily: "'Inter',sans-serif", marginLeft: 6 }}>{retryInfo}</span>}
                  <style>{`@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: '#742a2a',
                border: '1px solid #fc8181',
                color: '#fff',
                padding: '10px 14px',
                fontSize: 12,
                fontFamily: "'Inter',sans-serif",
              }}>{error}</div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Attached Image Preview */}
          {attachedImage && (
            <div style={{ padding: '8px 16px', borderTop: `1px solid ${T.cardBorder}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={attachedImage.preview} alt="Attached" style={{ width: 40, height: 40, objectFit: 'cover' }} />
              <span style={{ flex: 1, fontSize: 12, color: T.textMuted, fontFamily: "'Inter',sans-serif" }}>Image attached</span>
              <button onClick={() => { setAttachedImage(null); if (fileRef.current) fileRef.current.value = ''; }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14 }}>×</button>
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.cardBorder}`, display: 'flex', gap: 8 }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach photo or drawing"
              style={{
                background: attachedImage ? T.financial + '20' : 'transparent',
                border: `1px solid ${attachedImage ? T.financial : T.inputBorder}`,
                color: attachedImage ? T.financial : T.textMuted,
                padding: '0 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_a_photo</span>
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={attachedImage ? "Describe the photo or ask about it..." : "Ask about your project..."}
              disabled={loading}
              style={{
                flex: 1,
                background: T.input,
                border: `1px solid ${T.inputBorder}`,
                color: T.text,
                padding: '10px 12px',
                fontSize: 13,
                outline: 'none',
                fontFamily: "'Inter',sans-serif",
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && !attachedImage)}
              style={{
                background: loading || (!input.trim() && !attachedImage) ? T.cardBorder : T.financial,
                color: '#fff',
                border: 'none',
                padding: '0 14px',
                cursor: loading || (!input.trim() && !attachedImage) ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
