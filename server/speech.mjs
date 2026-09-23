// Narration uses the displayed briefing verbatim; it never computes new advice.
// https://developers.openai.com/api/docs/guides/text-to-speech
export async function synthesizeSpeech(text,{apiKey,fetchImpl=fetch,timeoutMs=25000}={}) {
  if(!apiKey) throw Object.assign(new Error('AI voice is unavailable; use device speech or read the briefing.'),{status:503});
  try {
    const response=await fetchImpl('https://api.openai.com/v1/audio/speech',{
      method:'POST',signal:AbortSignal.timeout(timeoutMs),
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'cedar',input:text,response_format:'mp3',
        instructions:'Read the supplied text exactly, without adding or changing words. Use a calm, clear civic briefing tone.'}),
    });
    if(!response.ok)throw new Error('Upstream speech request failed.');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.length || bytes.length>8*1024*1024)throw new Error('Unexpected audio size.');
    return bytes;
  } catch {
    throw Object.assign(new Error('AI voice is temporarily unavailable; use device speech or read the briefing.'),{status:503});
  }
}
