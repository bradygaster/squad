/**
 * Squad Initialization and Onboarding Tests
 * 
 * Tests for M2-6 (Squad Init Replatform) and M2-10 (Agent Onboarding).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { initSquad } from '@bradygaster/squad-sdk/config';
import { onboardAgent, addAgentToConfig } from '@bradygaster/squad-sdk/agents';
import type { InitOptions, InitAgentSpec } from '@bradygaster/squad-sdk/config';
import type { OnboardOptions } from '@bradygaster/squad-sdk/agents';

const TEST_ROOT = join(process.cwd(), 'test-fixtures', 'init-test');

describe('Squad Initialization', () => {
  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after each test
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  describe('initSquad', () => {
    it('should create TypeScript config with default options', async () => {
      const agents: InitAgentSpec[] = [
        { name: 'lead', role: 'lead' },
        { name: 'dev', role: 'developer' }
      ];

      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents,
        configFormat: 'typescript'
      };

      const result = await initSquad(options);

      // Verify config file was created
      expect(result.configPath).toBe(join(TEST_ROOT, 'squad.config.ts'));
      expect(existsSync(result.configPath)).toBe(true);

      // Verify config content
      const configContent = await readFile(result.configPath, 'utf-8');
      expect(configContent).toContain('import type { SquadConfig }');
      expect(configContent).toContain('Test Project');
      expect(configContent).toContain('const config: SquadConfig');
      expect(configContent).toContain('version: \'1.0.0\'');
      expect(configContent).toContain('@lead');
    });

    it('should create JSON config when specified', async () => {
      const agents: InitAgentSpec[] = [
        { name: 'lead', role: 'lead' }
      ];

      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents,
        configFormat: 'json'
      };

      const result = await initSquad(options);

      // Verify JSON config file
      expect(result.configPath).toBe(join(TEST_ROOT, 'squad.config.json'));
      expect(existsSync(result.configPath)).toBe(true);

      // Verify valid JSON
      const configContent = await readFile(result.configPath, 'utf-8');
      const parsed = JSON.parse(configContent);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.models.defaultModel).toBe('claude-sonnet-4.5');
      expect(parsed.routing.rules).toHaveLength(4);
    });

    it('should create agent directories with charter and history', async () => {
      const agents: InitAgentSpec[] = [
        { name: 'lead', role: 'lead', displayName: 'Keaton' },
        { name: 'developer', role: 'developer', displayName: 'Fenster' }
      ];

      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        projectDescription: 'A test project for Squad',
        agents,
        userName: 'TestUser'
      };

      const result = await initSquad(options);

      // Verify agent directories
      expect(result.agentDirs).toHaveLength(2);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'lead'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'developer'))).toBe(true);

      // Verify charter files
      const leadCharter = await readFile(join(TEST_ROOT, '.squad', 'agents', 'lead', 'charter.md'), 'utf-8');
      expect(leadCharter).toContain('# Keaton — Lead');
      expect(leadCharter).toContain('Test Project');
      expect(leadCharter).toContain('A test project for Squad');

      // Verify history files
      const leadHistory = await readFile(join(TEST_ROOT, '.squad', 'agents', 'lead', 'history.md'), 'utf-8');
      expect(leadHistory).toContain('# Project Context');
      expect(leadHistory).toContain('TestUser');
      expect(leadHistory).toContain('Test Project');
      expect(leadHistory).toContain('A test project for Squad');
    });

    it('should create .squad directory structure', async () => {
      const agents: InitAgentSpec[] = [{ name: 'lead', role: 'lead' }];
      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents
      };

      await initSquad(options);

      // Verify directory structure
      expect(existsSync(join(TEST_ROOT, '.squad'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'casting'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'decisions'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'skills'))).toBe(true);
    });

    it('should create .gitattributes for merge drivers', async () => {
      const agents: InitAgentSpec[] = [{ name: 'lead', role: 'lead' }];
      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents
      };

      const result = await initSquad(options);

      const gitattributesPath = join(TEST_ROOT, '.gitattributes');
      expect(existsSync(gitattributesPath)).toBe(true);

      const content = await readFile(gitattributesPath, 'utf-8');
      expect(content).toContain('history.md merge=union');
      expect(content).toContain('.squad/decisions.md merge=union');
    });

    it('should create initial decisions.md', async () => {
      const agents: InitAgentSpec[] = [{ name: 'lead', role: 'lead' }];
      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents
      };

      await initSquad(options);

      const decisionsPath = join(TEST_ROOT, '.squad', 'decisions.md');
      expect(existsSync(decisionsPath)).toBe(true);

      const content = await readFile(decisionsPath, 'utf-8');
      expect(content).toContain('# Squad Decisions');
      expect(content).toContain('## Active Decisions');
    });

    it('should create routing rules for common agent roles', async () => {
      const agents: InitAgentSpec[] = [
        { name: 'dev', role: 'developer' },
        { name: 'qa', role: 'tester' },
        { name: 'docs', role: 'scribe' }
      ];

      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents,
        configFormat: 'typescript'
      };

      const result = await initSquad(options);

      const configContent = await readFile(result.configPath, 'utf-8');
      expect(configContent).toContain('@dev');
      expect(configContent).toContain('@qa');
      expect(configContent).toContain('@docs');
      expect(configContent).toContain('bug-fix');
      expect(configContent).toContain('testing');
      expect(configContent).toContain('documentation');
    });

    it('should throw error if teamRoot is missing', async () => {
      const options = {
        teamRoot: '',
        projectName: 'Test',
        agents: [{ name: 'lead', role: 'lead' }]
      };

      await expect(initSquad(options)).rejects.toThrow('teamRoot is required');
    });

    it('should throw error if no agents provided', async () => {
      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test',
        agents: []
      };

      await expect(initSquad(options)).rejects.toThrow('At least one agent is required');
    });

    it('should handle multiple agents with same role', async () => {
      const agents: InitAgentSpec[] = [
        { name: 'dev1', role: 'developer', displayName: 'Dev One' },
        { name: 'dev2', role: 'developer', displayName: 'Dev Two' }
      ];

      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents
      };

      const result = await initSquad(options);

      expect(result.agentDirs).toHaveLength(2);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'dev1'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'dev2'))).toBe(true);

      const charter1 = await readFile(join(TEST_ROOT, '.squad', 'agents', 'dev1', 'charter.md'), 'utf-8');
      expect(charter1).toContain('Dev One');

      const charter2 = await readFile(join(TEST_ROOT, '.squad', 'agents', 'dev2', 'charter.md'), 'utf-8');
      expect(charter2).toContain('Dev Two');
    });

    it('should return list of all created files', async () => {
      const agents: InitAgentSpec[] = [
        { name: 'lead', role: 'lead' },
        { name: 'dev', role: 'developer' }
      ];

      const options: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents
      };

      const result = await initSquad(options);

      // Should include: config, 2 charters, 2 histories, gitattributes, decisions
      expect(result.createdFiles.length).toBeGreaterThanOrEqual(7);

      // Verify all files exist (paths are relative to teamRoot)
      for (const filePath of result.createdFiles) {
        expect(existsSync(join(TEST_ROOT, filePath))).toBe(true);
      }
    });
  });

  describe('onboardAgent', () => {
    beforeEach(async () => {
      // Create .squad/agents directory for onboarding tests
      await mkdir(join(TEST_ROOT, '.squad', 'agents'), { recursive: true });
    });

    it('should onboard agent with standard role template', async () => {
      const options: OnboardOptions = {
        teamRoot: TEST_ROOT,
        agentName: 'new-dev',
        role: 'developer',
        displayName: 'New Developer',
        projectContext: 'A cool project',
        userName: 'TestUser'
      };

      const result = await onboardAgent(options);

      expect(result.agentDir).toBe(join(TEST_ROOT, '.squad', 'agents', 'new-dev'));
      expect(existsSync(result.agentDir)).toBe(true);

      // Verify charter
      const charter = await readFile(result.charterPath, 'utf-8');
      expect(charter).toContain('# New Developer — Software Developer');
      expect(charter).toContain('A cool project');

      // Verify history
      const history = await readFile(result.historyPath, 'utf-8');
      expect(history).toContain('TestUser');
      expect(history).toContain('New Developer');
      expect(history).toContain('A cool project');
    });

    it('should onboard agent with custom charter template', async () => {
      const customCharter = '# Custom Charter\n\nThis is a custom charter template.';

      const options: OnboardOptions = {
        teamRoot: TEST_ROOT,
        agentName: 'custom',
        role: 'special',
        charterTemplate: customCharter
      };

      const result = await onboardAgent(options);

      const charter = await readFile(result.charterPath, 'utf-8');
      expect(charter).toBe(customCharter);
    });

    it('should generate generic charter for unknown role', async () => {
      const options: OnboardOptions = {
        teamRoot: TEST_ROOT,
        agentName: 'specialist',
        role: 'data-engineer',
        displayName: 'Data Specialist'
      };

      const result = await onboardAgent(options);

      const charter = await readFile(result.charterPath, 'utf-8');
      expect(charter).toContain('# Data Specialist — Data Engineer');
      expect(charter).toContain('Team member focused on data-engineer responsibilities');
    });

    it('should normalize agent names to kebab-case', async () => {
      const options: OnboardOptions = {
        teamRoot: TEST_ROOT,
        agentName: 'My New Agent',
        role: 'developer'
      };

      const result = await onboardAgent(options);

      expect(result.agentDir).toBe(join(TEST_ROOT, '.squad', 'agents', 'my-new-agent'));
      expect(existsSync(result.agentDir)).toBe(true);
    });

    it('should throw error if agent directory already exists', async () => {
      // Create agent directory first
      const agentDir = join(TEST_ROOT, '.squad', 'agents', 'existing');
      await mkdir(agentDir, { recursive: true });

      const options: OnboardOptions = {
        teamRoot: TEST_ROOT,
        agentName: 'existing',
        role: 'developer'
      };

      await expect(onboardAgent(options)).rejects.toThrow('Agent directory already exists');
    });

    it('should create charter for all standard roles', async () => {
      const roles = ['lead', 'developer', 'tester', 'scribe', 'ralph', 'designer', 'architect'];

      for (const role of roles) {
        const options: OnboardOptions = {
          teamRoot: TEST_ROOT,
          agentName: `agent-${role}`,
          role,
          projectContext: 'Test project'
        };

        const result = await onboardAgent(options);

        const charter = await readFile(result.charterPath, 'utf-8');
        expect(charter).toContain('# ');
        expect(charter).toContain('## Project Context');
        expect(charter).toContain('Test project');
        expect(charter).toContain('## Responsibilities');
        expect(charter).toContain('## Work Style');
      }
    });

    it('should throw error if required fields are missing', async () => {
      await expect(
        onboardAgent({ teamRoot: '', agentName: 'test', role: 'dev' })
      ).rejects.toThrow('teamRoot is required');

      await expect(
        onboardAgent({ teamRoot: TEST_ROOT, agentName: '', role: 'dev' })
      ).rejects.toThrow('agentName is required');

      await expect(
        onboardAgent({ teamRoot: TEST_ROOT, agentName: 'test', role: '' })
      ).rejects.toThrow('role is required');
    });

    it('should return created file paths', async () => {
      const options: OnboardOptions = {
        teamRoot: TEST_ROOT,
        agentName: 'new-agent',
        role: 'developer'
      };

      const result = await onboardAgent(options);

      expect(result.createdFiles).toHaveLength(2);
      expect(result.createdFiles).toContain(result.charterPath);
      expect(result.createdFiles).toContain(result.historyPath);

      for (const filePath of result.createdFiles) {
        expect(existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('addAgentToConfig', () => {
    it('should add agent routing rule to TypeScript config', async () => {
      // Create a basic TypeScript config
      const configContent = `import type { SquadConfig } from '@bradygaster/squad';

const config: SquadConfig = {
  version: '1.0.0',
  models: { defaultModel: 'claude-sonnet-4.5', defaultTier: 'standard', fallbackChains: { premium: [], standard: [], fast: [] } },
  routing: {
    rules: [
      {
        workType: 'documentation',
        agents: ['@scribe'],
        confidence: 'high'
      }
    ],
    governance: {}
  }
};

export default config;
`;

      const configPath = join(TEST_ROOT, 'squad.config.ts');
      await mkdir(TEST_ROOT, { recursive: true });
      await rm(configPath, { force: true });
      await writeFile(configPath, configContent, 'utf-8');

      // Add developer agent (should add feature-dev rule)
      const updated = await addAgentToConfig(TEST_ROOT, 'new-dev', 'developer');
      expect(updated).toBe(true);

      // Verify the config was updated
      const newContent = await readFile(configPath, 'utf-8');
      expect(newContent).toContain('@new-dev');
      expect(newContent).toContain('feature-dev');
    });

    it('should return false if no TypeScript config exists', async () => {
      const updated = await addAgentToConfig(TEST_ROOT, 'dev', 'developer');
      expect(updated).toBe(false);
    });

    it('should return false if work type already has a rule', async () => {
      const configContent = `import type { SquadConfig } from '@bradygaster/squad';

const config: SquadConfig = {
  version: '1.0.0',
  models: { defaultModel: 'claude-sonnet-4.5', defaultTier: 'standard', fallbackChains: { premium: [], standard: [], fast: [] } },
  routing: {
    rules: [
      {
        workType: 'feature-dev',
        agents: ['@existing-dev'],
        confidence: 'high'
      }
    ],
    governance: {}
  }
};

export default config;
`;

      await mkdir(TEST_ROOT, { recursive: true });
      await writeFile(join(TEST_ROOT, 'squad.config.ts'), configContent, 'utf-8');

      const updated = await addAgentToConfig(TEST_ROOT, 'new-dev', 'developer');
      expect(updated).toBe(false);
    });

    it('should return false for role without obvious work type mapping', async () => {
      const configContent = `import type { SquadConfig } from '@bradygaster/squad';
const config: SquadConfig = {
  version: '1.0.0',
  models: { defaultModel: 'claude-sonnet-4.5', defaultTier: 'standard', fallbackChains: { premium: [], standard: [], fast: [] } },
  routing: { rules: [], governance: {} }
};
export default config;
`;

      await mkdir(TEST_ROOT, { recursive: true });
      await writeFile(join(TEST_ROOT, 'squad.config.ts'), configContent, 'utf-8');

      const updated = await addAgentToConfig(TEST_ROOT, 'specialist', 'unknown-role');
      expect(updated).toBe(false);
    });

    it('should add agent to SDK-format config (defineSquad)', async () => {
      const sdkConfig = `import {
  defineSquad,
  defineTeam,
  defineAgent,
} from '@bradygaster/squad-sdk';

const scribe = defineAgent({
  name: 'scribe',
  role: 'scribe',
  description: 'Scribe',
  status: 'active',
});

export default defineSquad({
  version: '1.0.0',

  team: defineTeam({
    name: 'test-project',
    members: ['scribe'],
  }),

  agents: [scribe],
});
`;

      await mkdir(TEST_ROOT, { recursive: true });
      await writeFile(join(TEST_ROOT, 'squad.config.ts'), sdkConfig, 'utf-8');

      const updated = await addAgentToConfig(TEST_ROOT, 'fenster', 'developer', 'Fenster');
      expect(updated).toBe(true);

      const newContent = await readFile(join(TEST_ROOT, 'squad.config.ts'), 'utf-8');
      expect(newContent).toContain("name: 'fenster'");
      expect(newContent).toContain("role: 'developer'");
      expect(newContent).toContain("description: 'Fenster'");
      // Members array should include the new agent
      expect(newContent).toContain("'fenster'");
      // Agents array should include the variable
      const agentsMatch = newContent.match(/agents:\s*\[([^\]]+)\]/);
      expect(agentsMatch).toBeTruthy();
      expect(agentsMatch![1]).toContain('fenster');
    });

    it('should not duplicate agent in SDK-format config', async () => {
      const sdkConfig = `import {
  defineSquad,
  defineTeam,
  defineAgent,
} from '@bradygaster/squad-sdk';

const scribe = defineAgent({
  name: 'scribe',
  role: 'scribe',
  description: 'Scribe',
  status: 'active',
});

export default defineSquad({
  version: '1.0.0',

  team: defineTeam({
    name: 'test-project',
    members: ['scribe'],
  }),

  agents: [scribe],
});
`;

      await mkdir(TEST_ROOT, { recursive: true });
      await writeFile(join(TEST_ROOT, 'squad.config.ts'), sdkConfig, 'utf-8');

      const updated = await addAgentToConfig(TEST_ROOT, 'scribe', 'scribe');
      expect(updated).toBe(false);
    });
  });

  describe('Integration: Init + Onboard', () => {
    it('should initialize squad then onboard additional agent', async () => {
      // Initialize squad with one agent
      const initOptions: InitOptions = {
        teamRoot: TEST_ROOT,
        projectName: 'Test Project',
        agents: [{ name: 'lead', role: 'lead' }],
        configFormat: 'typescript'
      };

      await initSquad(initOptions);

      // Onboard additional agent
      const onboardOptions: OnboardOptions = {
        teamRoot: TEST_ROOT,
        agentName: 'qa-engineer',
        role: 'tester',
        displayName: 'QA Engineer',
        projectContext: 'Test Project - Quality Assurance'
      };

      const result = await onboardAgent(onboardOptions);

      // Verify both agents exist
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'lead'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'qa-engineer'))).toBe(true);

      // Verify new agent files
      const charter = await readFile(result.charterPath, 'utf-8');
      expect(charter).toContain('QA Engineer');

      const history = await readFile(result.historyPath, 'utf-8');
      expect(history).toContain('Quality Assurance');
    });

    it('should support full project lifecycle', async () => {
      // 1. Initialize with core team
      await initSquad({
        teamRoot: TEST_ROOT,
        projectName: 'Real Project',
        projectDescription: 'A production application',
        agents: [
          { name: 'keaton', role: 'lead', displayName: 'Keaton' },
          { name: 'fenster', role: 'developer', displayName: 'Fenster' }
        ],
        configFormat: 'typescript',
        userName: 'Brady'
      });

      // 2. Onboard specialist
      await onboardAgent({
        teamRoot: TEST_ROOT,
        agentName: 'verbal',
        role: 'scribe',
        displayName: 'Verbal',
        projectContext: 'Real Project - Documentation and History',
        userName: 'Brady'
      });

      // 3. Verify complete structure
      expect(existsSync(join(TEST_ROOT, 'squad.config.ts'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'keaton'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'fenster'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.squad', 'agents', 'verbal'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.gitattributes'))).toBe(true);

      // 4. Verify all charters have proper context
      const keatonCharter = await readFile(join(TEST_ROOT, '.squad', 'agents', 'keaton', 'charter.md'), 'utf-8');
      expect(keatonCharter).toContain('Keaton');
      expect(keatonCharter).toContain('Real Project');

      const verbalCharter = await readFile(join(TEST_ROOT, '.squad', 'agents', 'verbal', 'charter.md'), 'utf-8');
      expect(verbalCharter).toContain('Verbal');
      expect(verbalCharter).toContain('Real Project');
    });
  });
});
