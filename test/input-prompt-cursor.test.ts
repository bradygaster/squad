import { describe, expect, it } from 'vitest';
import { getNextWordBoundary, getPrevWordBoundary } from '@bradygaster/squad-cli/shell/components';

type Selection = { start: number; end: number };

function insertText(value: string, cursorPos: number, text: string): { value: string; cursorPos: number } {
  const nextValue = value.slice(0, cursorPos) + text + value.slice(cursorPos);
  return { value: nextValue, cursorPos: cursorPos + text.length };
}

function replaceSelection(
  value: string,
  selection: Selection,
  replacement: string,
): { value: string; cursorPos: number } {
  const nextValue = value.slice(0, selection.start) + replacement + value.slice(selection.end);
  return { value: nextValue, cursorPos: selection.start + replacement.length };
}

function backspace(value: string, cursorPos: number): { value: string; cursorPos: number } {
  if (cursorPos === 0) return { value, cursorPos };
  const nextValue = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
  return { value: nextValue, cursorPos: cursorPos - 1 };
}

function del(value: string, cursorPos: number): { value: string; cursorPos: number } {
  if (cursorPos >= value.length) return { value, cursorPos };
  const nextValue = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
  return { value: nextValue, cursorPos };
}

function deleteSelection(value: string, selection: Selection): { value: string; cursorPos: number } {
  const nextValue = value.slice(0, selection.start) + value.slice(selection.end);
  return { value: nextValue, cursorPos: selection.start };
}

describe('InputPrompt word boundary helpers', () => {
  describe('getPrevWordBoundary', () => {
    it('moves to start of previous boundary from middle of word', () => {
      expect(getPrevWordBoundary('hello world', 8)).toBe(6);
    });

    it('moves to start of previous word from between words', () => {
      expect(getPrevWordBoundary('hello world', 5)).toBe(0);
    });

    it('stays at start of string', () => {
      expect(getPrevWordBoundary('hello', 0)).toBe(0);
    });

    it('works from end of string', () => {
      expect(getPrevWordBoundary('hello world', 11)).toBe(6);
    });

    it('skips multiple spaces', () => {
      expect(getPrevWordBoundary('hello   world', 8)).toBe(0);
    });

    it('handles empty string', () => {
      expect(getPrevWordBoundary('', 0)).toBe(0);
    });
  });

  describe('getNextWordBoundary', () => {
    it('moves to end of current word from middle of word', () => {
      expect(getNextWordBoundary('hello world', 1)).toBe(5);
    });

    it('moves to end of next word from between words', () => {
      expect(getNextWordBoundary('hello world', 5)).toBe(11);
    });

    it('works from start of string', () => {
      expect(getNextWordBoundary('hello world', 0)).toBe(5);
    });

    it('stays at end of string', () => {
      expect(getNextWordBoundary('hello', 5)).toBe(5);
    });

    it('skips multiple spaces', () => {
      expect(getNextWordBoundary('hello   world', 5)).toBe(13);
    });

    it('handles empty string', () => {
      expect(getNextWordBoundary('', 0)).toBe(0);
    });
  });
});

describe('InputPrompt cursor edit behavior (logic)', () => {
  describe('insert', () => {
    it('inserts at beginning of string', () => {
      expect(insertText('world', 0, 'hello ')).toEqual({ value: 'hello world', cursorPos: 6 });
    });

    it('inserts in middle of string', () => {
      expect(insertText('helo', 3, 'l')).toEqual({ value: 'hello', cursorPos: 4 });
    });

    it('inserts at end of string', () => {
      expect(insertText('hello', 5, '!')).toEqual({ value: 'hello!', cursorPos: 6 });
    });
  });

  describe('backspace', () => {
    it('is a no-op at beginning', () => {
      expect(backspace('hello', 0)).toEqual({ value: 'hello', cursorPos: 0 });
    });

    it('deletes character before cursor in middle', () => {
      expect(backspace('hello', 3)).toEqual({ value: 'helo', cursorPos: 2 });
    });

    it('deletes last character at end', () => {
      expect(backspace('hello', 5)).toEqual({ value: 'hell', cursorPos: 4 });
    });
  });

  describe('delete', () => {
    it('deletes first character at beginning', () => {
      expect(del('hello', 0)).toEqual({ value: 'ello', cursorPos: 0 });
    });

    it('deletes character at cursor in middle', () => {
      expect(del('hello', 2)).toEqual({ value: 'helo', cursorPos: 2 });
    });

    it('is a no-op at end', () => {
      expect(del('hello', 5)).toEqual({ value: 'hello', cursorPos: 5 });
    });
  });

  describe('selection behavior', () => {
    it('replaces selected text with typed text', () => {
      expect(replaceSelection('hello world', { start: 6, end: 11 }, 'squad')).toEqual({
        value: 'hello squad',
        cursorPos: 11,
      });
    });

    it('backspace/delete with active selection deletes selected range', () => {
      const selection = { start: 1, end: 4 };
      expect(deleteSelection('hello', selection)).toEqual({ value: 'ho', cursorPos: 1 });
    });
  });
});
