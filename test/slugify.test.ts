import { describe, it, expect } from 'vitest';
import { slugify } from '../packages/squad-sdk/src/utils/slugify.js';

describe('slugify', () => {
  it('slugifies "Steve Rogers" to "steve-rogers"', () => {
    expect(slugify('Steve Rogers')).toBe('steve-rogers');
  });

  it('slugifies "Tony Stark (Iron Man)" to "tony-stark-iron-man"', () => {
    expect(slugify('Tony Stark (Iron Man)')).toBe('tony-stark-iron-man');
  });

  it('slugifies "Natasha Romanoff (Black Widow)" correctly', () => {
    expect(slugify('Natasha Romanoff (Black Widow)')).toBe('natasha-romanoff-black-widow');
  });

  it('slugifies single-word names', () => {
    expect(slugify('Thor')).toBe('thor');
  });

  it('slugifies "Doctor Strange (Stephen Strange)"', () => {
    expect(slugify('Doctor Strange (Stephen Strange)')).toBe('doctor-strange-stephen-strange');
  });

  it('handles names that are already slugified', () => {
    expect(slugify('steve-rogers')).toBe('steve-rogers');
  });

  it('handles Scribe and Ralph (exempt names)', () => {
    expect(slugify('Scribe')).toBe('scribe');
    expect(slugify('Ralph')).toBe('ralph');
  });

  it('handles leading/trailing special characters', () => {
    expect(slugify('  --Alpha--  ')).toBe('alpha');
  });

  it('collapses consecutive non-alphanumeric characters', () => {
    expect(slugify('a!!!b...c')).toBe('a-b-c');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });
});
