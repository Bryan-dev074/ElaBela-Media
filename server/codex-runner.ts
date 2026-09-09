import { spawn } from 'node:child_process';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ServiceError } from './contracts.js';

export interface CodexRun {
  prompt: string;
  schema: Record<string, unknown>;
  directory: string;
  onSearch?: (count: number) => void;
  timeoutMs?: number;
}
export interface CodexResult {
  text: string;
  openedUrls: string[];
  searches: number;
  webEvents?: Record<string, unknown>[];
}

export function codexArguments(schemaPath: string): string[] {
  return [
    'exec',
    '--ignore-user-config',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--disable',
    'shell_tool',
    '--disable',
    'apps',
    '--disable',
    'plugins',
    '-c',
    'project_doc_max_bytes=0',
    '-c',
    'web_search="live"',
    '-c',
    'approval_policy="never"',
    '--json',
    '--color',
    'never',
    '--output-schema',
    schemaPath,
    '-',
  ];
}

// Authentication remains owned by Codex. No auth files or provider credentials are copied.
export function codexEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(OPENAI_|CODEX_API_KEY$|META_|ELABELA_PAIR|ELABELA_TOKEN)/i.test(key)) delete environment[key];
  }
  return environment;
}

export async function resolveCodexExecutable(platform = process.platform): Promise<string> {
  if (process.env.ELABELA_CODEX_PATH) return process.env.ELABELA_CODEX_PATH;
  // Explorer does not inherit the Codex app's injected PATH. Discover the bundled
  // CLI without changing Windows PATH or pinning a directory replaced by updates.
  if (platform === 'win32' && process.env.LOCALAPPDATA) {
    const base = join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    try {
      const entries = await readdir(base, { withFileTypes: true });
      const candidates = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const path = join(base, entry.name, 'codex.exe');
            try {
              const file = await stat(path);
              return file.isFile() ? { path, modified: file.mtimeMs } : undefined;
            } catch {
              return undefined;
            }
          }),
      );
      const newest = candidates
        .filter((item) => item !== undefined)
        .sort((a, b) => b.modified - a.modified)[0];
      if (newest) return newest.path;
    } catch {
      /* A standalone CLI can still be found through PATH. */
    }
  }
  return 'codex';
}

export async function codexAvailable(): Promise<boolean> {
  const executable = await resolveCodexExecutable();
  return new Promise((resolve) => {
    const child = spawn(executable, ['login', 'status'], {
      windowsHide: true,
      shell: false,
      env: codexEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 8000);
    const read = (chunk: Buffer) => {
      if (output.length < 8000) output += chunk.toString();
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && /logged in/i.test(output));
    });
  });
}

export function collectCodexEvent(event: Record<string, unknown>, result: CodexResult): void {
  if (event.type !== 'item.completed') return;
  const item = event.item as Record<string, unknown> | undefined;
  if (item?.type === 'agent_message' && typeof item.text === 'string') result.text = item.text;
  if (item?.type !== 'web_search') return;
  result.webEvents ??= [];
  result.webEvents.push(item);
  result.searches++;
  const action = item.action as Record<string, unknown> | undefined;
  // CLI 0.153 emits a directly opened URL in query with action.type=other.
  // Search queries and model-authored final JSON are never evidence of opening a source.
  const candidates =
    action?.type === 'other' ? [item.query] : action?.type === 'open_page' ? [action.url] : [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.startsWith('https://')) continue;
    try {
      const url = new URL(candidate);
      if (!url.username && !url.password && !url.port && !result.openedUrls.includes(url.href))
        result.openedUrls.push(url.href);
    } catch {
      /* An unsupported event cannot establish provenance. */
    }
  }
}

export async function runCodexResearch(input: CodexRun): Promise<CodexResult> {
  const schemaPath = join(input.directory, 'schema.json');
  await writeFile(schemaPath, JSON.stringify(input.schema), { flag: 'wx' });
  await writeFile(join(input.directory, 'consulta.txt'), input.prompt, { flag: 'wx' });
  const executable = await resolveCodexExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, codexArguments(schemaPath), {
      cwd: input.directory,
      windowsHide: true,
      shell: false,
      env: codexEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const result: CodexResult = { text: '', openedUrls: [], searches: 0 };
    let pending = '',
      bytes = 0,
      failed = false,
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, input.timeoutMs ?? 600000);
    // Node's decoder retains partial UTF-8 sequences between JSONL chunks.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > 8 * 1024 * 1024) {
        failed = true;
        child.kill();
        return;
      }
      pending += chunk;
      for (;;) {
        const newline = pending.indexOf('\n');
        if (newline < 0) break;
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === 'turn.failed' || event.type === 'error') failed = true;
          const before = result.searches;
          collectCodexEvent(event, result);
          if (result.searches > before) input.onSearch?.(result.searches);
        } catch {
          /* Ignore non-JSON diagnostics; they are not displayed or stored. */
        }
      }
    });
    child.stderr.resume();
    child.stdin.on('error', () => {
      /* Process exit reports the failure below. */
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(
        new ServiceError('No se pudo iniciar Codex. Abrí Codex en esta PC y revisá su instalación.', 503),
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut)
        return reject(
          new ServiceError(
            'Codex alcanzó el límite de 10 minutos. Podés iniciar otra búsqueda; no se reintentó automáticamente.',
            504,
          ),
        );
      if (code !== 0 || failed || !result.text || !result.searches)
        return reject(
          new ServiceError(
            'Codex no completó la investigación. Revisá su sesión y los límites de tu cuenta antes de volver a buscar.',
            502,
          ),
        );
      resolve(result);
    });
    child.stdin.end(input.prompt);
  });
}
