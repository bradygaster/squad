/**
 * Tests for configuration loader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  loadConfigSync, 
  validateConfig,
  validateConfigDetailed,
  discoverConfigFile,
  ConfigValidationError,
  DEFAULT_CONFIG,
  type SquadConfig 
} from '@bradygaster/squad-sdk/runtime';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Configuration Loader', () => {
  const testDir = join(process.cwd(), 'test-fixtures', 'config');
  
  describe('validateConfig', () => {
    it('should validate a valid minimal config', () => {
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'standard' as const,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: [
            {
              workType: 'feature-dev',
              agents: ['@coordinator']
            }
          ]
        }
      };
      
      const validated = validateConfig(config);
      expect(validated.version).toBe('1.0.0');
      expect(validated.models.defaultModel).toBe('claude-sonnet-4.5');
    });
    
    it('should reject config without version', () => {
      const config = {
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'standard' as const,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: []
        }
      };
      
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });
    
    it('should reject config without models', () => {
      const config = {
        version: '1.0.0',
        routing: {
          rules: []
        }
      };
      
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });
    
    it('should reject config without routing', () => {
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'standard' as const,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        }
      };
      
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });
    
    it('should reject invalid model tier', () => {
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'invalid' as any,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: [
            {
              workType: 'feature-dev',
              agents: ['@coordinator']
            }
          ]
        }
      };
      
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });
    
    it('should merge with defaults for optional fields', () => {
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'standard' as const,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: [
            {
              workType: 'feature-dev',
              agents: ['@coordinator']
            }
          ]
        }
      };
      
      const validated = validateConfig(config);
      
      // Should have defaults merged
      expect(validated.casting).toBeDefined();
      expect(validated.platforms).toBeDefined();
      expect(validated.routing.governance).toBeDefined();
    });
    
    it('should provide helpful error messages', () => {
      const config = {
        version: '1.0.0'
      };
      
      try {
        validateConfig(config);
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        const err = error as ConfigValidationError;
        expect(err.errors.length).toBeGreaterThan(0);
        expect(err.message).toContain('Configuration validation failed');
      }
    });
  });
  
  describe('loadConfigSync', () => {
    beforeEach(() => {
      // Clean up test directory
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {}
      mkdirSync(testDir, { recursive: true });
    });
    
    afterEach(() => {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {}
    });
    
    it('should load valid JSON config', () => {
      const configPath = join(testDir, 'squad.config.json');
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'gpt-5.1-codex',
          defaultTier: 'standard',
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['gpt-5.1-codex'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: [
            {
              workType: 'bug-fix',
              agents: ['@developer']
            }
          ]
        }
      };
      
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      const result = loadConfigSync(testDir);
      expect(result.isDefault).toBe(false);
      expect(result.source).toBe(configPath);
      expect(result.config.models.defaultModel).toBe('gpt-5.1-codex');
    });
    
    it('should return default config when no config file exists', () => {
      const result = loadConfigSync(testDir);
      
      expect(result.isDefault).toBe(true);
      expect(result.source).toBeUndefined();
      expect(result.config).toEqual(DEFAULT_CONFIG);
    });
    
    it('should throw on invalid JSON', () => {
      const configPath = join(testDir, 'squad.config.json');
      writeFileSync(configPath, '{ invalid json }');
      
      expect(() => loadConfigSync(testDir)).toThrow();
    });
    
    it('should throw on validation failure', () => {
      const configPath = join(testDir, 'squad.config.json');
      const config = {
        version: '1.0.0'
        // Missing required fields
      };
      
      writeFileSync(configPath, JSON.stringify(config));
      
      expect(() => loadConfigSync(testDir)).toThrow(ConfigValidationError);
    });
  });
  
  describe('DEFAULT_CONFIG', () => {
    it('should have valid structure', () => {
      expect(DEFAULT_CONFIG.version).toBe('1.0.0');
      expect(DEFAULT_CONFIG.models.defaultModel).toBe('claude-sonnet-4.6');
      expect(DEFAULT_CONFIG.models.defaultTier).toBe('standard');
      expect(DEFAULT_CONFIG.models.fallbackChains.premium).toBeInstanceOf(Array);
      expect(DEFAULT_CONFIG.models.fallbackChains.standard).toBeInstanceOf(Array);
      expect(DEFAULT_CONFIG.models.fallbackChains.fast).toBeInstanceOf(Array);
      expect(DEFAULT_CONFIG.routing.rules).toBeInstanceOf(Array);
      expect(DEFAULT_CONFIG.routing.governance).toBeDefined();
    });
    
    it('should pass its own validation', () => {
      expect(() => validateConfig(DEFAULT_CONFIG)).not.toThrow();
    });
  });

  describe('validateConfigDetailed', () => {
    it('returns valid result for good config', () => {
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'standard' as const,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: [
            {
              workType: 'feature-dev',
              agents: ['@coordinator']
            }
          ]
        }
      };

      const result = validateConfigDetailed(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects duplicate work types as warnings', () => {
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'standard' as const,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: [
            { workType: 'feature-dev', agents: ['Lead'] },
            { workType: 'feature-dev', agents: ['Developer'] }
          ]
        }
      };

      const result = validateConfigDetailed(config);

      expect(result.warnings?.some(w => w.includes('Duplicate'))).toBe(true);
    });

    it('validates agent sources', () => {
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'standard' as const,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: [{ workType: 'feature-dev', agents: ['Lead'] }]
        },
        agentSources: [
          { type: 'invalid-type', location: 'path' }
        ]
      };

      const result = validateConfigDetailed(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('agentSources'))).toBe(true);
    });

    it('validates issue routing rules', () => {
      const config = {
        version: '1.0.0',
        models: {
          defaultModel: 'claude-sonnet-4.5',
          defaultTier: 'standard' as const,
          fallbackChains: {
            premium: ['claude-opus-4.6'],
            standard: ['claude-sonnet-4.5'],
            fast: ['claude-haiku-4.5']
          }
        },
        routing: {
          rules: [{ workType: 'feature-dev', agents: ['Lead'] }],
          issueRouting: [
            { label: 'bug', action: 'invalid-action' }
          ]
        }
      };

      const result = validateConfigDetailed(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('issueRouting'))).toBe(true);
    });
  });

  describe('discoverConfigFile', () => {
    beforeEach(() => {
      // Clean test directory before each test
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {}
      mkdirSync(testDir, { recursive: true });
    });

    it('finds config in current directory', () => {
      const configPath = join(testDir, 'squad.config.json');
      writeFileSync(configPath, '{}');

      const found = discoverConfigFile(testDir);

      expect(found).toBe(configPath);
    });

    it('walks up to find config in parent', () => {
      const parentDir = testDir;
      const childDir = join(testDir, 'subdir');
      mkdirSync(childDir, { recursive: true });

      const configPath = join(parentDir, 'squad.config.json');
      writeFileSync(configPath, '{}');

      const found = discoverConfigFile(childDir);

      expect(found).toBe(configPath);
    });

    it('returns undefined when no config found', () => {
      // Start from a clean test directory
      const emptyDir = join(testDir, 'empty-subdir');
      mkdirSync(emptyDir, { recursive: true });

      const found = discoverConfigFile(emptyDir);

      expect(found).toBeUndefined();
    });

    it('prefers squad.config.ts over json', () => {
      const tsPath = join(testDir, 'squad.config.ts');
      const jsonPath = join(testDir, 'squad.config.json');

      writeFileSync(tsPath, 'export default {};');
      writeFileSync(jsonPath, '{}');

      const found = discoverConfigFile(testDir);

      expect(found).toBe(tsPath);
    });

    it('finds .squad/config.json', () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(squadDir, { recursive: true });

      const configPath = join(squadDir, 'config.json');
      writeFileSync(configPath, '{}');

      const found = discoverConfigFile(testDir);

      expect(found).toBe(configPath);
    });
  });
});
