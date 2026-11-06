import type { ApiHandler } from '../server/public-api.ts';
import { adminClient, bodyTooLarge, clientIp, consumeLimit, joinSchema, prepare, sameOrigin, verifyTurnstile } from '../server/public-api.ts';

const handler: ApiHandler = async (request, response) => {
  prepare(response);
  if (request.method === 'GET') {
    try {
      const client = adminClient();
      const [wards, centres, stations, policy] = await Promise.all([
        client.from('wards').select('id,name').order('name'),
        client.from('polling_centres').select('id,name,ward_id').order('name'),
        client.from('polling_stations').select('id,station_name,ward_id,polling_centre_id').order('station_number'),
        client.from('settings').select('value').eq('key','consent_policy').maybeSingle(),
      ]);
      const error = wards.error || centres.error || stations.error || policy.error;
      if (error) { response.status(503).json({ error: 'The registration form is unavailable.' }); return; }
      const consent = policy.data?.value as { enabled?: boolean; version?: string; text?: string; text_sw?: string } | undefined;
      response.status(200).json({
        wards: wards.data || [], centres: centres.data || [],
        stations: (stations.data || []).map(({ id, station_name, ward_id, polling_centre_id }) => ({ id, name: station_name, ward_id, polling_centre_id })),
        consent: consent?.enabled && consent.version && consent.text ? { version: consent.version, text: consent.text, text_sw: consent.text_sw || null } : null,
      });
    } catch {
      response.status(503).json({ error: 'The registration form is unavailable.' });
    }
    return;
  }
  if (request.method !== 'POST') { response.setHeader('Allow','GET, POST'); response.status(405).json({ error: 'Method not allowed.' }); return; }
  if (bodyTooLarge(request)) { response.status(413).json({error:'Request is too large.'}); return; }
  if (!sameOrigin(request)) { response.status(403).json({ error: 'Request unavailable.' }); return; }
  const rawBody=request.body&&typeof request.body==='object'?request.body as Record<string,unknown>:{};
  if(typeof rawBody.website==='string'&&rawBody.website.trim()){response.status(202).json({accepted:true,message:'If this request can be accepted, it has been recorded.'});return;}
  let ip:string;let client:ReturnType<typeof adminClient>;
  try{
    ip=clientIp(request);client=adminClient();
    const ipAllowed=await consumeLimit(client,'join_ip',ip);
    const code=typeof rawBody.referral_code==='string'&&rawBody.referral_code.length<=64?rawBody.referral_code:'';
    const codeAllowed=code?await consumeLimit(client,'join_code',code):true;
    if(!ipAllowed||!codeAllowed){response.status(429).json({error:'Too many attempts. Please try again later.'});return;}
  }catch{response.status(503).json({error:'We could not submit this request. Please try again later.'});return;}
  const parsed = joinSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: 'Check the required form fields.', fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] || 'form')))] }); return; }
  const form = parsed.data;
  try {
    if (!await verifyTurnstile(form.turnstile_token,ip)) { response.status(400).json({ error: 'Complete the security check and try again.' }); return; }

    const [{ data: policyData, error: policyError }, { data: ward, error: wardError }] = await Promise.all([
      client.from('settings').select('value').eq('key','consent_policy').maybeSingle(),
      client.from('wards').select('id').eq('id',form.ward_id).maybeSingle(),
    ]);
    if (policyError || wardError) throw new Error('Request unavailable');
    const policy = policyData?.value as { enabled?:boolean;version?:string;text?:string }|undefined;
    if (!policy?.enabled || !policy.version || !policy.text || !ward) { response.status(503).json({ error: 'Registration is temporarily unavailable.' }); return; }
    if (form.polling_centre_id) {
      const { data: centre, error: centreError } = await client.from('polling_centres').select('id').eq('id',form.polling_centre_id).eq('ward_id',form.ward_id).maybeSingle();
      if (centreError) throw new Error('Request unavailable');
      if (!centre) { response.status(400).json({ error: 'Choose a polling centre in the selected ward.' }); return; }
    }
    if (form.polling_station_id) {
      if (!form.polling_centre_id) { response.status(400).json({ error: 'Choose a polling centre first.' }); return; }
      const { data: station, error: stationError } = await client.from('polling_stations').select('id').eq('id',form.polling_station_id).eq('ward_id',form.ward_id).eq('polling_centre_id',form.polling_centre_id).maybeSingle();
      if (stationError) throw new Error('Request unavailable');
      if (!station) { response.status(400).json({ error: 'Choose a polling station in the selected centre.' }); return; }
    }
    const { error: submitError } = await client.rpc('public_join', {
      p_client_request_id: crypto.randomUUID(),
      p_referral_code: form.referral_code,
      p_name: form.name,
      p_phone: form.phone,
      p_national_id: form.national_id,
      p_ward_filed_id: form.ward_id,
      p_polling_centre_id: form.polling_centre_id,
      p_polling_station_id: form.polling_station_id,
      p_polling_centre_label: null,
      p_polling_station_label: null,
      p_support_level: form.pledge ? 'strong_supporter' : 'not_assessed',
      p_consent: true,
      p_consent_text_version: policy.version,
    });
    if (submitError) { response.status(202).json({ accepted: true, message: 'If this request can be accepted, it has been recorded.' }); return; }
    response.status(202).json({ accepted: true, message: 'If this request can be accepted, it has been recorded.' });
  } catch {
    response.status(503).json({ error: 'We could not submit this request. Please try again later.' });
  }
};

export default handler;
