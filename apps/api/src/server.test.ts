import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from './server.js';

let server: ReturnType<typeof app.listen>;
let baseUrl = '';

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('API readiness and role protection', () => {
  it('returns the CSRF token and current user in one bootstrap response', async () => {
    const response = await fetch(`${baseUrl}/api/auth/csrf`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ csrfToken: expect.any(String), user: null });
  });

  it('reports the database as unavailable until MongoDB connects', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', database: 'disconnected' });
  });

  it('requires a session for teacher and admin workspaces', async () => {
    const [teacherResponse, adminResponse] = await Promise.all([
      fetch(`${baseUrl}/api/teacher/dashboard`),
      fetch(`${baseUrl}/api/admin/overview`),
    ]);
    expect(teacherResponse.status).toBe(401);
    expect(adminResponse.status).toBe(401);
    expect((await teacherResponse.json()).error.code).toBe('UNAUTHENTICATED');
    expect((await adminResponse.json()).error.code).toBe('UNAUTHENTICATED');
  });
});
