import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// Optional disposable TEST project fixtures. Required: TEST_SUPABASE_URL,
// TEST_SUPABASE_ANON_KEY, TEST_*_EMAIL/PASSWORD for all five roles,
// TEST_WARD_ID, TEST_CENTRE_ID, TEST_CONSENT_VERSION, TEST_ENTRY_A_ID,
// TEST_ENTRY_B_ID, TEST_ENTRY_OTHER_WARD_ID, and TEST_AUDIT_ID. Values are
// read locally and never logged. Do not point this suite at production.
try {
  const envFile = readFileSync('.env.test', 'utf8')
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch {
  // Tests below are skipped until a local/TEST project and synthetic users exist.
}

const env = process.env
const url = env.TEST_SUPABASE_URL
const anonKey = env.TEST_SUPABASE_ANON_KEY
const wardId = env.TEST_WARD_ID
const centreId = env.TEST_CENTRE_ID
const stationId = env.TEST_STATION_ID || ''
const roles = ['ADMIN', 'COORDINATOR', 'MOBILIZER_A', 'MOBILIZER_B', 'PENDING']
const credentials = Object.fromEntries(roles.map((role) => [role, {
  email: env[`TEST_${role}_EMAIL`], password: env[`TEST_${role}_PASSWORD`],
}]))
const fixtureIds = ['TEST_ENTRY_A_ID', 'TEST_ENTRY_B_ID', 'TEST_ENTRY_OTHER_WARD_ID', 'TEST_AUDIT_ID']
const configured = Boolean(url && anonKey && wardId && centreId && env.TEST_CONSENT_VERSION
  && fixtureIds.every((key) => env[key]) && roles.every((role) =>
  credentials[role].email && credentials[role].password))
const clients = {}

async function signIn(role) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword(credentials[role])
  if (error) throw error
  return client
}

async function submit(client, { name, id = null, phone = '712345678', consent = true } = {}) {
  return client.rpc('submit_entry', {
    p_client_request_id: randomUUID(),
    p_name: name,
    p_phone: phone,
    p_national_id: id,
    p_ward_filed_id: wardId,
    p_polling_centre_id: centreId,
    p_polling_station_id: stationId || null,
    p_polling_centre_label: null,
    p_polling_station_label: null,
    p_support_level: 'not_assessed',
    p_issues: [],
    p_needs_transport: false,
    p_has_pvc: false,
    p_notes: null,
    p_consent: consent,
    p_consent_text_version: consent ? env.TEST_CONSENT_VERSION : null,
  })
}

describe.skipIf(!configured)('RLS and security RPC integration (isolated TEST database only)', () => {
  beforeAll(async () => {
    for (const role of roles) clients[role] = await signIn(role)
  })

  afterAll(async () => {
    await Promise.all(Object.values(clients).map((client) => client.auth.signOut()))
  })

  it('blocks mobilizer direct UPDATE and DELETE on entries', async () => {
    const { error: updateError } = await clients.MOBILIZER_A.from('entries')
      .update({ name: 'Synthetic forbidden edit' }).eq('id', env.TEST_ENTRY_A_ID)
    const { error: deleteError } = await clients.MOBILIZER_A.from('entries')
      .delete().eq('id', env.TEST_ENTRY_A_ID)
    expect(updateError).toBeTruthy()
    expect(deleteError).toBeTruthy()
  })

  it('limits mobilizers to their own entries and coordinators to their ward', async () => {
    const [own, other, coordOtherWard] = await Promise.all([
      clients.MOBILIZER_A.from('entries').select('id').eq('id', env.TEST_ENTRY_A_ID),
      clients.MOBILIZER_A.from('entries').select('id').eq('id', env.TEST_ENTRY_B_ID),
      clients.COORDINATOR.from('entries').select('id').eq('id', env.TEST_ENTRY_OTHER_WARD_ID),
    ])
    expect(own.error).toBeNull()
    expect(own.data).toHaveLength(1)
    expect(other.error).toBeNull()
    expect(other.data).toHaveLength(0)
    expect(coordOtherWard.error).toBeNull()
    expect(coordOtherWard.data).toHaveLength(0)
  })

  it('makes audit_log admin-readable and append-only', async () => {
    const [adminRead, mobilizerRead, update, deletion] = await Promise.all([
      clients.ADMIN.from('audit_log').select('id').limit(1),
      clients.MOBILIZER_A.from('audit_log').select('id').limit(1),
      clients.ADMIN.from('audit_log').update({ reason: 'Synthetic forbidden edit' }).eq('id', env.TEST_AUDIT_ID),
      clients.ADMIN.from('audit_log').delete().eq('id', env.TEST_AUDIT_ID),
    ])
    expect(adminRead.error).toBeNull()
    expect(mobilizerRead.error).toBeNull()
    expect(mobilizerRead.data).toHaveLength(0)
    expect(update.error || update.data?.length === 0).toBeTruthy()
    expect(deletion.error || deletion.data?.length === 0).toBeTruthy()
  })

  it('rejects pending mobilizers and captures without consent', async () => {
    const pending = await submit(clients.PENDING, { name: 'Synthetic Pending Fixture' })
    const noConsent = await submit(clients.MOBILIZER_A, { name: 'Synthetic Consent Fixture', consent: false })
    expect(pending.error).toBeTruthy()
    expect(noConsent.error).toBeTruthy()
  })

  it('blocks a repeated synthetic ID and treats a shared phone as informational', async () => {
    const syntheticId = `9${Date.now().toString().slice(-6)}`
    const first = await submit(clients.MOBILIZER_A, {
      name: 'Synthetic Duplicate Fixture Alpha', id: syntheticId, phone: '712345671',
    })
    expect(first.error).toBeNull()
    for (const client of [clients.MOBILIZER_A, clients.COORDINATOR]) {
      const search = await client.rpc('search_entries', { p_query: syntheticId, p_ward_id: wardId })
      expect(search.error).toBeNull()
      expect(JSON.stringify(search.data)).not.toContain(syntheticId)
    }
    const repeated = await submit(clients.MOBILIZER_A, {
      name: 'Synthetic Duplicate Fixture Beta', id: syntheticId, phone: '712345672',
    })
    expect(repeated.error).toBeNull()
    expect(repeated.data?.blocked).toBe(true)
    const sharedPhone = await submit(clients.MOBILIZER_A, {
      name: `Synthetic Shared Phone ${randomUUID().slice(0, 8)}`, phone: '712345671',
    })
    expect(sharedPhone.error).toBeNull()
    expect(sharedPhone.data?.blocked).not.toBe(true)
    expect(sharedPhone.data?.flags).toContain('SHARED_PHONE')
  })

  it('does not return full ID values in mobilizer or coordinator search results', async () => {
    const [mobilizer, coordinator] = await Promise.all([
      clients.MOBILIZER_A.rpc('search_entries', { p_query: 'Synthetic', p_ward_id: wardId }),
      clients.COORDINATOR.rpc('search_entries', { p_query: 'Synthetic', p_ward_id: wardId }),
    ])
    for (const result of [mobilizer, coordinator]) {
      expect(result.error).toBeNull()
      const serialized = JSON.stringify(result.data)
      expect(serialized).not.toMatch(/1111111/)
      expect(serialized).not.toMatch(/national_id_encrypted|id_hash/)
    }
  })

  it('denies anon access to protected data and RPCs', async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } })
    const [rows, result] = await Promise.all([
      anon.from('entries').select('id').limit(1),
      anon.rpc('submit_entry', {
        p_client_request_id: randomUUID(), p_name: 'Synthetic Anon Fixture', p_phone: null,
        p_national_id: null, p_ward_filed_id: wardId, p_polling_centre_id: centreId,
        p_polling_station_id: null, p_polling_centre_label: null, p_polling_station_label: null,
        p_support_level: 'not_assessed', p_issues: [], p_needs_transport: false,
        p_has_pvc: false, p_notes: null, p_consent: false, p_consent_text_version: null,
      }),
    ])
    expect(rows.error || rows.data?.length === 0).toBeTruthy()
    expect(result.error).toBeTruthy()
  })

  it('does not let a mobilizer change their own role or status', async () => {
    const { error } = await clients.MOBILIZER_A.from('profiles')
      .update({ role: 'admin', status: 'approved' }).eq('id', (await clients.MOBILIZER_A.auth.getUser()).data.user.id)
    expect(error).toBeTruthy()
  })

  it('imports a synthetic batch idempotently when repeated', async () => {
    const importId = randomUUID()
    const rows = [{
      name: `Synthetic Import Fixture ${randomUUID().slice(0, 8)}`,
      phone: '712345679',
      ward_id: wardId,
      polling_centre_id: centreId,
      polling_station_id: stationId || null,
      captured_on: '2025-01-02T03:04:05Z',
    }]
    const first = await clients.ADMIN.rpc('import_entries_batch', {
      p_import_id: importId, p_file_name: 'synthetic-test.csv', p_rows: rows, p_dry_run: false,
    })
    const second = await clients.ADMIN.rpc('import_entries_batch', {
      p_import_id: importId, p_file_name: 'synthetic-test.csv', p_rows: rows, p_dry_run: false,
    })
    expect(first.error).toBeNull()
    expect(first.data?.imported).toBe(1)
    expect(second.error).toBeNull()
    expect(second.data?.imported).toBe(0)
    expect(second.data?.merged).toBe(1)
  })
})
