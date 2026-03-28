import { useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { sendChatMessage } from '../utils/aiService';

const PLACEHOLDER_EXAMPLES = [
  "bought 500 bags cement from Ali Brothers at 1250 each",
  "paid 85000 for 200 cft sand to Malik & Sons",
  "10 steel bars 40ft from Ittefaq at 3200 per bar",
  "electric wire 500m @ 45/m from National Hardware",
];

const NL_SYSTEM_PROMPT = `You are a data extraction assistant for a construction project tracker in Pakistan. Parse the user's natural language input into a structured material purchase entry. Return ONLY valid JSON with this exact schema:
{
  "material": "string - material/item description",
  "supplier": "string - supplier/vendor name or empty",
  "qty": number or null,
  "unit": "string - bags, cft, kg, m, pcs, etc or empty",
  "rate": number or null - per unit price in PKR,
  "total": number - total amount in PKR,
  "category": "grey" or "finishing",
  "date": "YYYY-MM-DD or empty - today's date if mentioned"
}
Rules:
- If total is not given but qty and rate are, calculate total = qty * rate
- If only total is given without qty/rate, set qty and rate to null
- Guess category: cement, sand, gravel, steel, bricks = "grey". Paint, tiles, fittings, fixtures, wood/polish, electric, plumbing = "finishing"
- Support both English and Urdu input
- Do NOT include any explanation, only the JSON`;

export default function NLEntryBar({ onExtracted }) {
  const { S, T } = useTheme();
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));

  const handleParse = async () => {
    const input = text.trim();
    if (!input || parsing) return;

    setParsing(true);
    setError('');

    try {
      const messages = [
        { role: 'system', content: NL_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ];

      const response = await sendChatMessage(messages, {});
      const raw = response.reply || response.content || '';

      let parsed;
      try {
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        setError('Could not parse input. Try rephrasing.');
        setParsing(false);
        return;
      }

      onExtracted({
        date: parsed.date || new Date().toISOString().split('T')[0],
        material: parsed.material || '',
        category: parsed.category || 'grey',
        supplier: parsed.supplier || '',
        qty: parsed.qty != null ? String(parsed.qty) : '',
        unit: parsed.unit || '',
        rate: parsed.rate != null ? String(parsed.rate) : '',
        total: parsed.total != null ? String(parsed.total) : '',
        unpaid: parsed.total != null ? String(parsed.total) : '0',
        status: 'Unpaid',
        notes: '',
      });

      setText('');
    } catch (e) {
      setError(e.message || 'Failed to parse');
    }
    setParsing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    }
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        background: T.card, border: `1px solid ${T.cardBorder}`, padding: '4px 4px 4px 16px',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.financial, flexShrink: 0 }}>magic_button</span>
        <input
          ref={inputRef}
          value={text}
          onChange={e => { setText(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          placeholder={`Type in plain text: "${PLACEHOLDER_EXAMPLES[placeholderIdx]}"`}
          disabled={parsing}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif",
            padding: '10px 0',
          }}
        />
        <button
          onClick={handleParse}
          disabled={parsing || !text.trim()}
          style={{
            background: parsing || !text.trim() ? T.cardBorder : T.financial,
            color: '#fff', border: 'none', padding: '8px 16px',
            cursor: parsing || !text.trim() ? 'default' : 'pointer',
            fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 700,
            letterSpacing: 1, textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: parsing || !text.trim() ? 0.5 : 1,
          }}
        >
          {parsing ? (
            <>
              <div style={{
                width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                borderTop: '2px solid #fff', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              Parsing...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix_high</span>
              Add
            </>
          )}
        </button>
      </div>
      {error && (
        <div style={{ color: T.danger, fontSize: 11, fontFamily: "'Inter',sans-serif", marginTop: 6, paddingLeft: 36 }}>
          {error}
        </div>
      )}
    </div>
  );
}
