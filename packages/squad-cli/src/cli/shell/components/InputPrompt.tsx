import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { isNoColor, useTerminalWidth } from '../terminal.js';
import { createCompleter } from '../autocomplete.js';

interface InputPromptProps {
  onSubmit: (value: string) => void;
  prompt?: string;
  disabled?: boolean;
  agentNames?: string[];
  /** Number of messages exchanged so far — drives progressive hint text. */
  messageCount?: number;
}

/** Return context-appropriate placeholder hint based on session progress.
 *  The header banner already shows @agent / /help guidance, so the prompt
 *  placeholder provides complementary tips instead of duplicating it. */
function getHintText(messageCount: number, narrow: boolean): string {
  if (messageCount < 10) {
    return narrow ? ' Tab · ↑↓ history' : ' Tab completes · ↑↓ history';
  }
  return narrow ? ' /status · /clear · /export' : ' /status · /clear · /export';
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const InputPrompt: React.FC<InputPromptProps> = ({ 
  onSubmit, 
  prompt = '> ',
  disabled = false,
  agentNames = [],
  messageCount = 0,
}) => {
  const noColor = isNoColor();
  const width = useTerminalWidth();
  const narrow = width < 60;
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [spinFrame, setSpinFrame] = useState(0);
  const [bufferDisplay, setBufferDisplay] = useState('');
  const bufferRef = useRef('');
  const wasDisabledRef = useRef(disabled);
  const pendingInputRef = useRef<string[]>([]);
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef('');

  // When transitioning from disabled → enabled, restore buffered input
  useEffect(() => {
    if (wasDisabledRef.current && !disabled) {
      // Clear any pending paste timer from before disable
      if (pasteTimerRef.current) {
        clearTimeout(pasteTimerRef.current);
        pasteTimerRef.current = null;
      }
      // Drain pending input queue first (fast typing during transition)
      const pending = pendingInputRef.current.join('');
      pendingInputRef.current = [];
      
      const combined = bufferRef.current + pending;
      if (combined) {
        valueRef.current = combined;
        setValue(combined);
        bufferRef.current = '';
        setBufferDisplay('');
      } else {
        valueRef.current = '';
      }
    }
    wasDisabledRef.current = disabled;
  }, [disabled]);

  const completer = useMemo(() => createCompleter(agentNames), [agentNames]);

  // Tab-cycling state
  const tabMatchesRef = useRef<string[]>([]);
  const tabIndexRef = useRef(0);
  const tabPrefixRef = useRef('');

  // Animate spinner when disabled (processing) — static in NO_COLOR mode
  useEffect(() => {
    if (!disabled || noColor) return;
    const timer = setInterval(() => {
      setSpinFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 150);
    return () => clearInterval(timer);
  }, [disabled, noColor]);

  // Clean up paste detection timer on unmount
  useEffect(() => {
    return () => {
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
    };
  }, []);

  useInput((input, key) => {
    if (disabled) {
      // Allow slash commands through while processing (read-only, no dispatch)
      if (key.return && bufferRef.current.trimStart().startsWith('/')) {
        const cmd = bufferRef.current.trim();
        bufferRef.current = '';
        setBufferDisplay('');
        pendingInputRef.current = [];
        onSubmit(cmd);
        return;
      }
      // Preserve newlines from pasted text in disabled buffer
      if (key.return) {
        bufferRef.current += '\n';
        setBufferDisplay(bufferRef.current);
        return;
      }
      if (key.upArrow || key.downArrow || key.ctrl || key.meta) return;
      if (key.backspace || key.delete) {
        bufferRef.current = bufferRef.current.slice(0, -1);
        setBufferDisplay(bufferRef.current);
        return;
      }
      if (input) {
        // Queue input to catch race during disabled→enabled transition
        pendingInputRef.current.push(input);
        bufferRef.current += input;
        setBufferDisplay(bufferRef.current);
      }
      return;
    }
    
    // Race guard: if we just re-enabled but haven't drained queue yet, queue this too
    if (wasDisabledRef.current && pendingInputRef.current.length > 0) {
      pendingInputRef.current.push(input || '');
      return;
    }
    
    if (key.return) {
      // Debounce to detect multi-line paste: if more input arrives
      // within 10ms this is a paste and the newline should be preserved.
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
      valueRef.current += '\n';
      pasteTimerRef.current = setTimeout(() => {
        pasteTimerRef.current = null;
        const submitVal = valueRef.current.trim();
        if (submitVal) {
          onSubmit(submitVal);
          setHistory(prev => [...prev, submitVal]);
          setHistoryIndex(-1);
        }
        valueRef.current = '';
        setValue('');
      }, 10);
      return;
    }
    
    if (key.backspace || key.delete) {
      valueRef.current = valueRef.current.slice(0, -1);
      setValue(valueRef.current);
      return;
    }
    
    if (key.upArrow && history.length > 0) {
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      valueRef.current = history[newIndex]!;
      setValue(history[newIndex]!);
      return;
    }
    
    if (key.downArrow) {
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          valueRef.current = '';
          setValue('');
        } else {
          setHistoryIndex(newIndex);
          valueRef.current = history[newIndex]!;
          setValue(history[newIndex]!);
        }
      }
      return;
    }
    
    if (key.tab) {
      if (tabPrefixRef.current !== value) {
        // New prefix — compute matches
        tabPrefixRef.current = value;
        tabIndexRef.current = 0;
        const [matches] = completer(value);
        tabMatchesRef.current = matches;
      } else {
        // Same prefix — cycle to next match
        if (tabMatchesRef.current.length > 0) {
          tabIndexRef.current = (tabIndexRef.current + 1) % tabMatchesRef.current.length;
        }
      }
      if (tabMatchesRef.current.length > 0) {
        valueRef.current = tabMatchesRef.current[tabIndexRef.current]!;
        setValue(tabMatchesRef.current[tabIndexRef.current]!);
      }
      return;
    }
    // Reset tab state on any other key
    tabMatchesRef.current = [];
    tabPrefixRef.current = '';
    
    if (input && !key.ctrl && !key.meta) {
      valueRef.current += input;
      setValue(valueRef.current);
    }
  });

  if (disabled) {
    return (
      <Box flexDirection="column">
        <Box>
          {noColor ? (
            <>
              <Text bold>{narrow ? 'sq ' : '◆ squad '}</Text>
              <Text>[working...]</Text>
              {bufferDisplay ? <Text> {bufferDisplay}</Text> : null}
            </>
          ) : (
            <>
              <Text color="cyan" bold>{narrow ? 'sq ' : '◆ squad '}</Text>
              <Text color="cyan">{SPINNER_FRAMES[spinFrame]}</Text>
              <Text color="cyan" bold>{'> '}</Text>
              {bufferDisplay ? <Text dimColor>{bufferDisplay}</Text> : null}
            </>
          )}
        </Box>
        {!bufferDisplay && <Text dimColor>[working...]</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={noColor ? undefined : 'cyan'} bold>{narrow ? 'sq> ' : '◆ squad> '}</Text>
        <Text>{value}</Text>
        <Text color={noColor ? undefined : 'cyan'} bold>▌</Text>
      </Box>
      {!value && (
        <Text dimColor>{getHintText(messageCount, narrow)}</Text>
      )}
    </Box>
  );
};
