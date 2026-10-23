import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { findWorkflowJavaScriptViolations } from '../scripts/release/check-release-scripts.mjs';

const WORKFLOWS = path.resolve(__dirname, '..', '.github', 'workflows');

describe('release script policy', () => {
  it('keeps workflow JavaScript in checked scripts/release modules', () => {
    const violations: string[] = [];
    for (const file of readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml')).sort()) {
      const text = readFileSync(path.join(WORKFLOWS, file), 'utf8');
      violations.push(...findWorkflowJavaScriptViolations(text, file));
    }
    expect(violations).toEqual([]);
  });

  it.each([
    ['node dash heredoc', "run: |\n  node - <<'NODE'\n  console.log('x')\n  NODE\n"],
    ['node heredoc', "run: |\n  node <<'NODE'\n  console.log('x')\n  NODE\n"],
    ['node -e double quote', 'run: |\n  node -e "const value = {\n    broken: true\n  }"\n'],
    ['node -e single quote', "run: |\n  node -e 'const value = {\n    broken: true\n  }'\n"],
    ['node --eval', 'run: |\n  node --eval "const value = {\n    broken: true\n  }"\n'],
    ['node --eval single quote', "run: |\n  node --eval 'const value = {\n    broken: true\n  }'\n"],
    ['node --eval equals', 'run: |\n  node --eval="const value = {\n    broken: true\n  }"\n'],
    ['node --eval equals single quote', "run: |\n  node --eval='const value = {\n    broken: true\n  }'\n"],
    ['node -p', 'run: |\n  node -p "JSON.stringify({\n    broken: true\n  })"\n'],
    ['node -p single quote', "run: |\n  node -p 'JSON.stringify({\n    broken: true\n  })'\n"],
    ['node --print', 'run: |\n  node --print "JSON.stringify({\n    broken: true\n  })"\n'],
    ['node --print single quote', "run: |\n  node --print 'JSON.stringify({\n    broken: true\n  })'\n"],
    ['node --print equals', 'run: |\n  node --print="JSON.stringify({\n    broken: true\n  })"\n'],
    ['node --print equals single quote', "run: |\n  node --print='JSON.stringify({\n    broken: true\n  })'\n"],
    ['node -pe', 'run: |\n  node -pe "JSON.stringify({\n    broken: true\n  })"\n'],
    ['node -pe single quote', "run: |\n  node -pe 'JSON.stringify({\n    broken: true\n  })'\n"],
    ['node -ep', 'run: |\n  node -ep "JSON.stringify({\n    broken: true\n  })"\n'],
    ['node -ep single quote', "run: |\n  node -ep 'JSON.stringify({\n    broken: true\n  })'\n"],
    ['node attached -e', 'run: |\n  node -e"const value = {\n    broken: true\n  }"\n'],
    ['node attached -e single quote', "run: |\n  node -e'const value = {\n    broken: true\n  }'\n"],
    ['node attached -p', 'run: |\n  node -p"JSON.stringify({\n    broken: true\n  })"\n'],
    ['node attached -p single quote', "run: |\n  node -p'JSON.stringify({\n    broken: true\n  })'\n"],
    ['node attached -pe', 'run: |\n  node -pe"JSON.stringify({\n    broken: true\n  })"\n'],
    ['node attached -pe single quote', "run: |\n  node -pe'JSON.stringify({\n    broken: true\n  })'\n"],
    ['node attached -ep', 'run: |\n  node -ep"JSON.stringify({\n    broken: true\n  })"\n'],
    ['node attached -ep single quote', "run: |\n  node -ep'JSON.stringify({\n    broken: true\n  })'\n"],
    ['command substitution', 'run: |\n  value=$(node -e "process.stdout.write(\n    String(1)\n  )")\n'],
    ['backslash continuation after flag', 'run: |\n  node -e \\\n    "console.log(1)"\n'],
    ['backslash continuation before flag', 'run: |\n  node \\\n    -e "console.log(1)"\n'],
    ['folded scalar', 'run: >-\n  node -e "const value = {\n    broken: true\n  }"\n'],
  ])('rejects multi-line inline JavaScript via %s', (_name, workflow) => {
    expect(findWorkflowJavaScriptViolations(workflow, 'fixture.yml')).not.toEqual([]);
  });

  it.each([
    ['node -e', 'run: node -e "console.log(1)"\n'],
    ['node --eval', 'run: node --eval "console.log(1)"\n'],
    ['node --eval equals', 'run: node --eval="console.log(1)"\n'],
    ['node -p', 'run: echo "$(node -p "1 + 1")"\n'],
    ['node --print', 'run: node --print "1 + 1"\n'],
    ['node --print equals', 'run: node --print="1 + 1"\n'],
    ['node -pe', 'run: node -pe "1 + 1"\n'],
    ['node -ep attached', 'run: node -ep"1 + 1"\n'],
    ['block node -e', 'run: |\n  node -e "console.log(1)"\n  echo done\n'],
  ])('allows single-line inline JavaScript via %s', (_name, workflow) => {
    expect(findWorkflowJavaScriptViolations(workflow, 'fixture.yml')).toEqual([]);
  });
});
