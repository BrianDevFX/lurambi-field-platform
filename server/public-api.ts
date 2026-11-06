import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}
export type ApiHandler = (request: ApiRequest, response: ApiResponse) => Promise<void>;

export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Server configuration unavailable');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function header(request: ApiRequest, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function clientIp(request: ApiRequest): string {
  const forwarded = header(request, 'x-forwarded-for');
  const ip = forwarded.split(',')[0]?.trim() || header(request, 'x-real-ip').trim();
  if (!ip || ip.length > 80) throw new Error('Request unavailable');
  return ip;
}

export function sameOrigin(request: ApiRequest): boolean {
  const origin = header(request, 'origin');
  const host = header(request, 'host');
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host.toLowerCase(); }
  catch { return false; }
}

export function bodyTooLarge(request: ApiRequest): boolean {
  const length = Number(header(request,'content-length') || 0);
  return Number.isFinite(length) && length > 16_384;
}

export function prepare(response: ApiResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Vary', 'Origin');
}

export async function consumeLimit(client: SupabaseClient, scope: string, subject: string): Promise<boolean> {
  const { data, error } = await client.rpc('consume_public_rate_limit', { p_scope: scope, p_subject: subject });
  if (error) throw new Error('Request unavailable');
  return (data as { allowed?: boolean } | null)?.allowed === true;
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const form = new URLSearchParams({ secret, response: token, remoteip: ip });
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  if (!result.ok) return false;
  const body = await result.json() as { success?: boolean };
  return body.success === true;
}

export const joinSchema = z.object({
  referral_code: z.string().trim().regex(/^[A-Z0-9]{6}$/i),
  name: z.string().trim().min(2).max(120),
  national_id: z.union([z.string().trim().regex(/^\d{7,8}$/), z.literal('')]).optional().transform((value) => value || null),
  phone: z.string().trim().min(7).max(32),
  ward_id: z.string().uuid(),
  polling_centre_id: z.union([z.string().uuid(), z.literal('')]).optional().transform((value) => value || null),
  polling_station_id: z.union([z.string().uuid(), z.literal('')]).optional().transform((value) => value || null),
  pledge: z.boolean(),
  consent: z.literal(true),
  turnstile_token: z.string().min(1).max(4096),
  website: z.string().max(200).optional(),
}).strict();

export const dsrSchema = z.object({
  request_type: z.enum(['access', 'correction', 'deletion']),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(32),
  national_id: z.union([z.string().trim().regex(/^\d{7,8}$/), z.literal('')]).optional().transform((value) => value || null),
  notes: z.string().trim().max(1000).optional(),
  turnstile_token: z.string().min(1).max(4096),
  website: z.string().max(200).optional(),
}).strict();
