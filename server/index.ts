import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';
import fastifyStatic from '@fastify/static';
import { buildApp, type LocalApp } from './app.js';
import { createCodexResearch } from './codex-research.js';
import { codexAvailable } from './codex-runner.js';
import { createCreativeIntegrations } from './providers.js';
import { createPublisher } from './publisher.js';
import { acquireServiceLock } from './service-lock.js';

const HOST = '127.0.0.1';
const PORT = 4317;

export async function startServer(root = process.cwd()): Promise<LocalApp> {
  const release = await acquireServiceLock(root);
  try {
    const envFile = join(root, '.env');
    if (await exists(envFile)) loadEnvFile(envFile);
    const distribution = join(root, 'dist');
    const indexFile = join(distribution, 'index.html');
    const hasFrontend = await exists(indexFile);
    const researchProvider = process.env.ELABELA_RESEARCH_PROVIDER === 'api' ? 'api' : 'codex';
    const researchReady =
      researchProvider === 'codex' ? await codexAvailable() : Boolean(process.env.OPENAI_API_KEY);
    const app = await buildApp({
      root,
      recoverJobs: true,
      researchStatus: { researchProvider, researchReady },
      integrations: {
        ...createCreativeIntegrations(),
        ...createPublisher(),
        ...(researchProvider === 'codex' ? createCodexResearch() : {}),
      },
      notFoundHandler: hasFrontend
        ? async (request, reply) => {
            if (
              request.method === 'GET' &&
              !request.url.startsWith('/api/') &&
              !request.url.startsWith('/assets/')
            ) {
              return reply.type('text/html').sendFile('index.html');
            }
            return reply.status(404).send({ error: 'Ruta no encontrada' });
          }
        : undefined,
    });
    if (hasFrontend) {
      await app.register(fastifyStatic, { root: distribution });
    }
    app.addHook('onClose', release);
    await app.listen({ host: HOST, port: PORT });
    return app;
  } catch (error) {
    await release();
    throw error;
  }
}

async function main(): Promise<void> {
  const app = await startServer();
  const shutdown = async () => {
    await app.beginShutdown();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdout.write(`ElaBela Media disponible en http://${HOST}:${PORT}\n`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    process.stderr.write(`No se pudo iniciar ElaBela Media: ${message}\n`);
    process.exitCode = 1;
  });
}
