import type { ApiHandler } from '../server/public-api.ts';
import { adminClient, bodyTooLarge, clientIp, consumeLimit, dsrSchema, prepare, sameOrigin, verifyTurnstile } from '../server/public-api.ts';

const handler: ApiHandler = async (request,response) => {
  prepare(response);
  if (request.method !== 'POST') { response.setHeader('Allow','POST'); response.status(405).json({error:'Method not allowed.'}); return; }
  if (bodyTooLarge(request)) { response.status(413).json({error:'Request is too large.'}); return; }
  if (!sameOrigin(request)) { response.status(403).json({error:'Request unavailable.'}); return; }
  const rawBody=request.body&&typeof request.body==='object'?request.body as Record<string,unknown>:{};
  if(typeof rawBody.website==='string'&&rawBody.website.trim()){response.status(202).json({accepted:true,message:'Your request has been received.'});return;}
  let ip:string;let client:ReturnType<typeof adminClient>;
  try{ip=clientIp(request);client=adminClient();if(!await consumeLimit(client,'dsr_ip',ip)){response.status(429).json({error:'Too many attempts. Please try again later.'});return;}}
  catch{response.status(503).json({error:'We could not submit this request. Please try again later.'});return;}
  const parsed=dsrSchema.safeParse(request.body);
  if(!parsed.success){response.status(400).json({error:'Check the required form fields.',fields:[...new Set(parsed.error.issues.map((issue)=>String(issue.path[0]||'form')))]});return;}
  const form=parsed.data;
  try{
    const subjectAllowed=await consumeLimit(client,'dsr_subject',form.phone);
    if(!subjectAllowed){response.status(429).json({error:'Too many attempts. Please try again later.'});return;}
    if(!await verifyTurnstile(form.turnstile_token,ip)){response.status(400).json({error:'Complete the security check and try again.'});return;}
    const {error}=await client.rpc('submit_data_subject_request',{
      p_request_type:form.request_type,p_name:form.name,p_phone:form.phone,p_national_id:form.national_id,p_notes:form.notes||null,
    });
    if(error){response.status(400).json({error:'We could not accept the request. Check the details and try again.'});return;}
    response.status(202).json({accepted:true,message:'Your request has been received.'});
  }catch{
    response.status(503).json({error:'We could not submit this request. Please try again later.'});
  }
};

export default handler;
