import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  onSubmit: (question: string) => void;
  loading: boolean;
  answer?: string | null;
}

const SUGGESTIONS = [
  'Qual foi a taxa de presença média esta semana?',
  'Que horário tem mais entradas pela manhã?',
  'Houve algum dia com presença abaixo de 70%?',
  'Qual turma tem mais atrasos?',
  'Compare a presença de segunda com sexta-feira',
];

export default function AIQueryBox({ onSubmit, loading, answer }: Props) {
  const [question, setQuestion] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAnswer, setShowAnswer] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (answer) setShowAnswer(true); }, [answer]);

  const handleSubmit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setQuestion('');
    setShowSuggestions(false);
  };

  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Input area */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sparkles size={16} style={{ color: '#7c3aed', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Pergunta em linguagem natural</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit(question)}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Ex: Qual foi a taxa de presença esta semana?"
            disabled={loading}
            style={{
              flex: 1, border: '1px solid var(--color-border)', borderRadius: 8,
              padding: '8px 12px', fontSize: 13, outline: 'none',
              background: 'var(--color-bg)', color: 'var(--color-text)',
              transition: 'border-color 0.15s',
            }}
          />
          <button
            onClick={() => handleSubmit(question)}
            disabled={!question.trim() || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: loading ? 'var(--color-border)' : '#7c3aed',
              color: '#fff', fontSize: 13, fontWeight: 600,
              opacity: !question.trim() || loading ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {loading
              ? <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
              : <Send size={14} />
            }
            {loading ? 'Analisando...' : 'Perguntar'}
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && (
          <div style={{
            marginTop: 6, background: 'var(--color-bg)',
            border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden',
          }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => { setQuestion(s); setShowSuggestions(false); handleSubmit(s); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-secondary)', borderBottom: i < SUGGESTIONS.length - 1 ? '1px solid var(--color-border)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {s}
              </button>
            ))}
            <button onClick={() => setShowSuggestions(false)}
              style={{ display: 'block', width: '100%', textAlign: 'center', padding: '6px', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              Fechar sugestões
            </button>
          </div>
        )}
      </div>

      {/* Answer area */}
      {answer && (
        <div>
          <button
            onClick={() => setShowAnswer(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: '#7c3aed',
              borderBottom: showAnswer ? '1px solid var(--color-border)' : 'none',
            }}
          >
            <Sparkles size={13} />
            Resposta da IA
            {showAnswer ? <ChevronUp size={13} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={13} style={{ marginLeft: 'auto' }} />}
          </button>
          {showAnswer && (
            <div style={{
              padding: '14px 16px', fontSize: 13, lineHeight: 1.7,
              color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap',
            }}>
              {answer}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
