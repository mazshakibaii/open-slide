import { brotliDecompressSync } from 'node:zlib';
import type { Connect, ViteDevServer } from 'vite';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { decodeWoff2 } from '../woff2.ts';
import { json } from './context.ts';

// POST /__sfnt   body: WOFF2 bytes → the TrueType/OpenType bytes they decode to
//
// The PPTX export embeds fonts as plain sfnt, and browsers cannot brotli-decompress.

const MAX_BYTES = 32 * 1024 * 1024;

function readBytes(req: Connect.IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('font is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

export function registerSfntRoutes(server: ViteDevServer): void {
  server.middlewares.use('/__sfnt', async (req, res, next) => {
    if (req.method !== 'POST') return next();
    const check = validateMutationRequest(req);
    if (!check.ok) return json(res, check.status, { error: check.error });
    try {
      const woff2 = await readBytes(req);
      const sfnt = decodeWoff2(woff2, (data) => new Uint8Array(brotliDecompressSync(data)));
      res.statusCode = 200;
      res.setHeader('content-type', 'font/sfnt');
      res.setHeader('cache-control', 'no-store');
      res.end(Buffer.from(sfnt));
    } catch (err) {
      json(res, 422, { error: String((err as Error).message ?? err) });
    }
  });
}
