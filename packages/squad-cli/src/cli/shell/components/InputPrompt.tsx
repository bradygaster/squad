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

export function getPrevWordBoundary(text: string, pos: number): number {
  let i = Math.max(0, Math.min(pos, text.length));
  while (i > 0 && /\s/.test(text[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(text[i - 1]!)) i--;
  return i;
}

export function getNextWordBoundary(text: string, pos: number): number {
  let i = Math.max(0, Math.min(pos, text.length));
  while (i < text.length && /\s/.test(text[i]!)) i++;
  while (i < text.length && !/\s/.test(text[i]!)) i++;
  return i;
}

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
  const [cursorPos, setCursorPos] = useState(0);
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [spinFrame, setSpinFrame] = useState(0);
  const [bufferDisplay, setBufferDisplay] = useState('');
  const bufferRef = useRef('');
  const wasDisabledRef = useRef(disabled);
  const pendingInputRef = useRef<string[]>([]);
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef('');
  const cursorPosRef = useRef(0);
  const selectionAnchorRef = useRef<number | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

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
        cursorPosRef.current = combined.length;
        selectionAnchorRef.current = null;
        setValue(combined);
        setCursorPos(combined.length);
        setSelectionAnchor(null);
        bufferRef.current = '';
        setBufferDisplay('');
      } else {
        valueRef.current = '';
        cursorPosRef.current = 0;
        selectionAnchorRef.current = null;
        setCursorPos(0);
        setSelectionAnchor(null);
      }
    }
    wasDisabledRef.current = disabled;
  }, [disabled]);

  const completer = useMemo(() => createCompleter(agentNames), [agentNames]);

  // Tab-cycling state
  const tabMatchesRef = useRef<string[]>([]);
  const tabIndexRef = useRef(0);
  const tabPrefixRef = useRef('');

  const hasSelection = selectionAnchor !== null && selectionAnchor !== cursorPos;
  const selectionStart = hasSelection ? Math.min(selectionAnchor!, cursorPos) : -1;
  const selectionEnd = hasSelection ? Math.max(selectionAnchor!, cursorPos) : -1;

  const applyInputState = (nextValue: string, nextCursorPos: number, nextSelectionAnchor: number | null = null) => {
    const clampedCursor = Math.max(0, Math.min(nextCursorPos, nextValue.length));
    valueRef.current = nextValue;
    cursorPosRef.current = clampedCursor;
    selectionAnchorRef.current = nextSelectionAnchor;
    setValue(nextValue);
    setCursorPos(clampedCursor);
    setSelectionAnchor(nextSelectionAnchor);
  };

  const replaceSelectionOrInsert = (insertText: string) => {
    const currentValue = valueRef.current;
    const currentCursor = cursorPosRef.current;
    const currentSelectionAnchor = selectionAnchorRef.current;
    const currentHasSelection = currentSelectionAnchor !== null && currentSelectionAnchor !== currentCursor;
    const currentSelectionStart = currentHasSelection ? Math.min(currentSelectionAnchor!, currentCursor) : -1;
    const currentSelectionEnd = currentHasSelection ? Math.max(currentSelectionAnchor!, currentCursor) : -1;

    if (currentHasSelection) {
      const before = currentValue.slice(0, currentSelectionStart);
      const after = currentValue.slice(currentSelectionEnd);
      const nextValue = before + insertText + after;
      const nextCursor = currentSelectionStart + insertText.length;
      applyInputState(nextValue, nextCursor, null);
      return;
    }
    const before = currentValue.slice(0, currentCursor);
    const after = currentValue.slice(currentCursor);
    const nextValue = before + insertText + after;
    const nextCursor = currentCursor + insertText.length;
    applyInputState(nextValue, nextCursor, null);
  };

  const deleteSelectionIfAny = (): boolean => {
    const currentValue = valueRef.current;
    const currentCursor = cursorPosRef.current;
    const currentSelectionAnchor = selectionAnchorRef.current;
    const currentHasSelection = currentSelectionAnchor !== null && currentSelectionAnchor !== currentCursor;
    if (!currentHasSelection) return false;
    const currentSelectionStart = Math.min(currentSelectionAnchor!, currentCursor);
    const currentSelectionEnd = Math.max(currentSelectionAnchor!, currentCursor);
    const nextValue = currentValue.slice(0, currentSelectionStart) + currentValue.slice(currentSelectionEnd);
    applyInputState(nextValue, currentSelectionStart, null);
    return true;
  };

  const moveCursor = (nextCursor: number, withShift: boolean) => {
    const currentValue = valueRef.current;
    const currentCursor = cursorPosRef.current;
    const currentSelectionAnchor = selectionAnchorRef.current;
    const clamped = Math.max(0, Math.min(nextCursor, currentValue.length));
    if (withShift) {
      const anchor = currentSelectionAnchor ?? currentCursor;
      selectionAnchorRef.current = anchor;
      cursorPosRef.current = clamped;
      setSelectionAnchor(anchor);
      setCursorPos(clamped);
      return;
    }
    selectionAnchorRef.current = null;
    cursorPosRef.current = clamped;
    setSelectionAnchor(null);
    setCursorPos(clamped);
  };

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
      const currentValue = valueRef.current;
      const currentCursor = cursorPosRef.current;
      const currentSelectionAnchor = selectionAnchorRef.current;
      const currentHasSelection = currentSelectionAnchor !== null && currentSelectionAnchor !== currentCursor;
      const currentSelectionStart = currentHasSelection ? Math.min(currentSelectionAnchor!, currentCursor) : -1;
      const currentSelectionEnd = currentHasSelection ? Math.max(currentSelectionAnchor!, currentCursor) : -1;
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
      if (currentHasSelection) {
        const nextValue = currentValue.slice(0, currentSelectionStart) + '\n' + currentValue.slice(currentSelectionEnd);
        applyInputState(nextValue, currentSelectionStart + 1, null);
      } else {
        const nextValue = currentValue.slice(0, currentCursor) + '\n' + currentValue.slice(currentCursor);
        applyInputState(nextValue, currentCursor + 1, null);
      }
      pasteTimerRef.current = setTimeout(() => {
        pasteTimerRef.current = null;
        const submitVal = valueRef.current.trim();
        if (submitVal) {
          onSubmit(submitVal);
          setHistory(prev => {
            const next = [...prev, submitVal];
            historyRef.current = next;
            return next;
          });
          historyIndexRef.current = -1;
          setHistoryIndex(-1);
        }
        applyInputState('', 0, null);
      }, 10);
      return;
    }

    if (key.ctrl && (input === 'a' || input === 'A')) {
      selectionAnchorRef.current = 0;
      cursorPosRef.current = valueRef.current.length;
      setSelectionAnchor(0);
      setCursorPos(valueRef.current.length);
      return;
    }

    if (key.leftArrow) {
      const currentValue = valueRef.current;
      const currentCursor = cursorPosRef.current;
      const nextPos = key.ctrl ? getPrevWordBoundary(currentValue, currentCursor) : currentCursor - 1;
      moveCursor(nextPos, key.shift);
      return;
    }

    if (key.rightArrow) {
      const currentValue = valueRef.current;
      const currentCursor = cursorPosRef.current;
      const nextPos = key.ctrl ? getNextWordBoundary(currentValue, currentCursor) : currentCursor + 1;
      moveCursor(nextPos, key.shift);
      return;
    }

    if (key.home) {
      moveCursor(0, key.shift);
      return;
    }

    if (key.end) {
      moveCursor(valueRef.current.length, key.shift);
      return;
    }

    const isBackspaceChar = input === '\u007f' || input === '\b';

    if (key.backspace || isBackspaceChar) {
      if (deleteSelectionIfAny()) return;
      const currentValue = valueRef.current;
      const currentCursor = cursorPosRef.current;
      if (currentCursor > 0) {
        const nextValue = currentValue.slice(0, currentCursor - 1) + currentValue.slice(currentCursor);
        applyInputState(nextValue, currentCursor - 1, null);
      }
      return;
    }

    if (key.delete) {
      if (isBackspaceChar) {
        if (deleteSelectionIfAny()) return;
        const currentValue = valueRef.current;
        const currentCursor = cursorPosRef.current;
        if (currentCursor > 0) {
          const nextValue = currentValue.slice(0, currentCursor - 1) + currentValue.slice(currentCursor);
          applyInputState(nextValue, currentCursor - 1, null);
        }
        return;
      }
      if (deleteSelectionIfAny()) return;
      const currentValue = valueRef.current;
      const currentCursor = cursorPosRef.current;
      // Some terminals report Backspace (DEL, 0x7f) as delete=true with no input.
      // When we're at end-of-line, interpret that as a backspace for compatibility.
      if (currentCursor === currentValue.length && currentCursor > 0) {
        const nextValue = currentValue.slice(0, currentCursor - 1) + currentValue.slice(currentCursor);
        applyInputState(nextValue, currentCursor - 1, null);
        return;
      }
      if (currentCursor < currentValue.length) {
        const nextValue = currentValue.slice(0, currentCursor) + currentValue.slice(currentCursor + 1);
        applyInputState(nextValue, currentCursor, null);
      }
      return;
    }
    
    if (key.upArrow && historyRef.current.length > 0) {
      const newIndex = historyIndexRef.current === -1 ? historyRef.current.length - 1 : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = newIndex;
      setHistoryIndex(newIndex);
      const recalled = historyRef.current[newIndex]!;
      applyInputState(recalled, recalled.length, null);
      return;
    }
    
    if (key.downArrow) {
      if (historyIndexRef.current >= 0) {
        const newIndex = historyIndexRef.current + 1;
        if (newIndex >= historyRef.current.length) {
          historyIndexRef.current = -1;
          setHistoryIndex(-1);
          applyInputState('', 0, null);
        } else {
          historyIndexRef.current = newIndex;
          setHistoryIndex(newIndex);
          const recalled = historyRef.current[newIndex]!;
          applyInputState(recalled, recalled.length, null);
        }
      }
      return;
    }
    
    if (key.tab) {
      const currentValue = valueRef.current;
      if (tabPrefixRef.current !== currentValue) {
        // New prefix — compute matches
        tabPrefixRef.current = currentValue;
        tabIndexRef.current = 0;
        const [matches] = completer(currentValue);
        tabMatchesRef.current = matches;
      } else {
        // Same prefix — cycle to next match
        if (tabMatchesRef.current.length > 0) {
          tabIndexRef.current = (tabIndexRef.current + 1) % tabMatchesRef.current.length;
        }
      }
      if (tabMatchesRef.current.length > 0) {
        const completed = tabMatchesRef.current[tabIndexRef.current]!;
        applyInputState(completed, completed.length, null);
      }
      return;
    }
    // Reset tab state on any other key
    tabMatchesRef.current = [];
    tabPrefixRef.current = '';
    
    if (input && !key.ctrl && !key.meta) {
      replaceSelectionOrInsert(input);
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
        {hasSelection ? (
          <>
            <Text>{value.slice(0, selectionStart)}</Text>
            <Text inverse>{value.slice(selectionStart, selectionEnd)}</Text>
            <Text>{value.slice(selectionEnd)}</Text>
          </>
        ) : (
          <>
            <Text>{value.slice(0, cursorPos)}</Text>
            {cursorPos < value.length ? (
              <Text inverse>{value[cursorPos]}</Text>
            ) : (
              <Text color={noColor ? undefined : 'cyan'} bold>▌</Text>
            )}
            <Text>{value.slice(Math.min(cursorPos + 1, value.length))}</Text>
          </>
        )}
      </Box>
      {!value && (
        <Text dimColor>{getHintText(messageCount, narrow)}</Text>
      )}
    </Box>
  );
};
