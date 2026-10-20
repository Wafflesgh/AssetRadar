/**
 * CommandLine.tsx — Terminal command line with autocomplete, keyboard handling ("/" to
 * focus, Esc, Tab, arrows), feedback/error messages and the HELP table.
 */
import { useLang, useT } from '../../i18n/index.ts';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  terminalHelp,
  TerminalCommand,
  getCommandSuggestions,
  parseTerminalCommand,
} from '../../utils/terminalCommands.ts';

type Feedback = { kind: 'ok' | 'error'; text: string } | null;

interface CommandLineProps {
  /** Called for valid commands (not HELP/errors). Returns a confirmation text. */
  onCommand: (cmd: Exclude<TerminalCommand, { type: 'help' } | { type: 'error' }>) => string;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Command line: "/" to focus, Esc to clear, Tab/↑↓ for autocomplete. */
export function CommandLine({ onCommand }: CommandLineProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [focused, setFocused] = useState(false);

  const t = useT();
  const lang = useLang();
  const suggestions = focused ? getCommandSuggestions(value, 6, lang) : [];

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && !isTypingTarget(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = (text: string) => {
    const cmd = parseTerminalCommand(text, lang);
    setValue('');
    setActiveIndex(0);
    if (!cmd) return;
    if (cmd.type === 'help') {
      setShowHelp(true);
      setFeedback({ kind: 'ok', text: t('term.ok.help') });
      return;
    }
    if (cmd.type === 'error') {
      setFeedback({ kind: 'error', text: cmd.message });
      return;
    }
    setShowHelp(false);
    setFeedback({ kind: 'ok', text: onCommand(cmd) });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setValue('');
      setFeedback(null);
      setShowHelp(false);
      return;
    }
    if (suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((i) => (i + step + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      setValue(suggestions[Math.min(activeIndex, suggestions.length - 1)].command);
      setActiveIndex(0);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      run(value);
    }
  };

  return (
    <div className="terminal-mono relative border-b" style={{ borderColor: 'var(--t-line)' }}>
      <div className="flex items-center gap-2 px-2.5 h-9" style={{ backgroundColor: 'var(--t-bg)' }}>
        <label htmlFor="terminal-command" className="text-xs font-bold" style={{ color: 'var(--t-amber)' }}>
          &gt;
        </label>
        <input
          id="terminal-command"
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={t('term.placeholder')}
          aria-describedby="terminal-feedback"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="terminal-suggestions"
          className="flex-1 min-w-0 bg-transparent outline-none text-xs uppercase placeholder:normal-case"
          style={{ color: 'var(--t-amber)' }}
        />
        <button
          type="button"
          onClick={() => run(value)}
          className="px-2 h-6 text-[10px] font-bold tracking-widest"
          style={{ backgroundColor: 'var(--t-amber)', color: '#05070A', borderRadius: 2 }}
        >
          {t('term.go')}
        </button>
      </div>

      {suggestions.length > 0 && (
        <ul
          id="terminal-suggestions"
          role="listbox"
          className="absolute left-0 right-0 sm:right-auto sm:w-96 top-9 z-20 border text-xs"
          style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-amber)' }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.command}
              role="option"
              aria-selected={i === activeIndex}
              // onMouseDown so it still runs before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                run(s.command);
              }}
              className="flex justify-between gap-3 px-2.5 py-1 cursor-pointer"
              style={{
                backgroundColor: i === activeIndex ? 'var(--t-amber-soft)' : undefined,
              }}
            >
              <span className="font-bold" style={{ color: 'var(--t-amber)' }}>
                {s.command}
              </span>
              <span className="truncate" style={{ color: 'var(--t-muted)' }}>
                {s.description}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div id="terminal-feedback" aria-live="polite">
        {feedback && (
          <p
            className="px-2.5 pb-1.5 text-[11px]"
            style={{ color: feedback.kind === 'error' ? 'var(--t-down)' : 'var(--t-muted)' }}
          >
            {feedback.kind === 'error' ? '✖ ' : '› '}
            {feedback.text}
          </p>
        )}
      </div>

      {showHelp && (
        <div className="px-2.5 pb-2">
          <table className="text-[11px]">
            <tbody>
              {terminalHelp(lang).map((h) => (
                <tr key={h.command}>
                  <td className="pr-4 py-0.5 font-bold whitespace-nowrap" style={{ color: 'var(--t-amber)' }}>
                    {h.command}
                  </td>
                  <td style={{ color: 'var(--t-text)' }}>{h.description}</td>
                </tr>
              ))}
              <tr>
                <td className="pr-4 py-0.5 font-bold" style={{ color: 'var(--t-amber)' }}>
                  1–9
                </td>
                <td style={{ color: 'var(--t-text)' }}>{t('term.shortcut')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
