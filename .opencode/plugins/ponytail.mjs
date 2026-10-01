// ponytail — OpenCode V2 plugin.
//
// Injects the ponytail ruleset into every chat's system prompt at the active
// intensity, persists /ponytail mode switches, and registers slash commands.
//
// OpenCode loads this as a server plugin — add it to your opencode.json:
//   { "plugin": ["@dietrichgebert/ponytail"] }

import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
const { getPonytailInstructions } = require('../../hooks/ponytail-instructions');
const { getDefaultMode, normalizePersistedMode } = require('../../hooks/ponytail-config');
const { parseCommandFile } = require('./ponytail-frontmatter.cjs');

const statePath = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'opencode',
  '.ponytail-active',
);

function readMode() {
  try {
    return normalizePersistedMode(fs.readFileSync(statePath, 'utf8').trim()) || getDefaultMode();
  } catch {
    return getDefaultMode();
  }
}

function writeMode(mode) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, mode);
}

function switchMode(text) {
  const args = text.replace(/^\/ponytail\s*/, '').trim();
  const mode = args ? normalizePersistedMode(args) : getDefaultMode();
  if (mode) writeMode(mode);
  return mode;
}

export default {
  id: 'ponytail',

  async setup(ctx) {
    const ponytailSkillsDir = path.resolve(__dirname, '../../skills');
    const commandDir = path.join(__dirname, '..', 'command');

    // Register slash commands.
    await ctx.command.transform((editor) => {
      for (const file of fs.readdirSync(commandDir).filter((f) => f.endsWith('.md'))) {
        const name = path.basename(file, '.md');
        const parsed = parseCommandFile(path.join(commandDir, file));
        if (!parsed) continue;

        editor.add({
          name,
          description: parsed.description || `ponytail ${name}`,
          execute: async ({ sessionID, prompt, delivery }) => {
            const text = prompt.text || '';
            if (name === 'ponytail') {
              const mode = switchMode(text);
              await ctx.session.prompt({
                ...prompt,
                sessionID,
                text: `ponytail mode: ${mode}`,
                delivery,
              });
            } else {
              await ctx.session.prompt({
                ...prompt,
                sessionID,
                text: parsed.content || text,
                delivery,
              });
            }
          },
        });
      }
    });

    // Register skills.
    await ctx.skill.transform((editor) => {
      for (const skillDir of fs.readdirSync(ponytailSkillsDir)) {
        const skillPath = path.join(ponytailSkillsDir, skillDir);
        if (!fs.statSync(skillPath).isDirectory()) continue;
        editor.add({
          id: `ponytail-${skillDir}`,
          name: skillDir,
          description: `ponytail ${skillDir}`,
          path: skillPath,
        });
      }
    });

    // Inject ruleset into system prompt every turn.
    await ctx.session.hook('context', (event) => {
      const mode = readMode();
      if (mode === 'off') return;
      event.system.push({ type: 'text', text: getPonytailInstructions(mode) });
    });
  },
};
