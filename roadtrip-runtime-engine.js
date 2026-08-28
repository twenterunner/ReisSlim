export async function mapConcurrent(items,worker,{concurrency=4,onProgress}={}){
  const list=[...(items||[])],results=new Array(list.length);
  let next=0,completed=0;
  async function runner(){
    while(true){
      const index=next++;
      if(index>=list.length)return;
      try{results[index]=await worker(list[index],index)}
      catch(error){results[index]={error}}
      completed++;
      onProgress?.({completed,total:list.length,index,item:list[index],result:results[index]});
    }
  }
  const count=Math.max(1,Math.min(Number(concurrency)||1,list.length||1));
  await Promise.all(Array.from({length:count},runner));
  return results;
}

export async function firstSuccessful(tasks){
  const wrapped=(tasks||[]).map(task=>Promise.resolve().then(task).then(value=>{
    if(value==null)throw new Error('empty-result');
    return value;
  }));
  if(!wrapped.length)throw new Error('no-tasks');
  return Promise.any(wrapped);
}

export async function withTimeout(task,timeoutMs,label='operation'){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await task(controller.signal)}
  catch(error){
    if(error?.name==='AbortError')throw new Error(`${label}-timeout`);
    throw error;
  }finally{clearTimeout(timer)}
}

export function makeCache(storage,prefix){
  return{
    get(key){
      try{
        const raw=storage?.getItem(`${prefix}:${key}`);
        if(!raw)return null;
        const parsed=JSON.parse(raw);
        if(parsed.expiresAt&&Date.now()>parsed.expiresAt){storage.removeItem(`${prefix}:${key}`);return null}
        return parsed.value;
      }catch{return null}
    },
    set(key,value,ttlMs=6*60*60*1000){
      try{storage?.setItem(`${prefix}:${key}`,JSON.stringify({expiresAt:Date.now()+ttlMs,value}))}catch{}
    }
  };
}
