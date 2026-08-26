
const prefAliases=Object.freeze({
  natuur:['natuur','groen','bossen','landschap'],
  bergen:['bergen','berg','alpen','hoogte'],
  wandelen:['wandelen','hiken','hiking','wandel'],
  zwemmen:['zwemmen','water','meer','meren'],
  cultuur:['cultuur','museum','musea','historie','historisch'],
  eten:['eten','restaurant','culinair','food'],
  motor:['motor','motorrijden','bochten','mooie wegen','passen'],
  kust:['kust','zee','strand']
});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const numberFrom=(text,re)=>{const m=text.match(re);return m?Number(String(m[1]).replace(',','.')):null};

export function interpretAssistantMessage(message,trip){
  const raw=String(message||'').trim();
  const text=raw.toLowerCase();
  if(!text)return{understood:false,message:'Beschrijf wat je anders wilt, bijvoorbeeld “maximaal 4 uur rijden per dag en meer natuur”.'};

  const patch={};
  const changes=[];
  let optimizerMode=null;

  const hours=numberFrom(text,/(?:max(?:imaal)?|hoogstens|niet meer dan)\s*(\d+(?:[.,]\d+)?)\s*(?:uur|u)\b/);
  if(hours){patch.maxDrive=clamp(hours,2,10);changes.push(`max. ${patch.maxDrive} uur rijden per dag`)}

  const days=numberFrom(text,/(\d{1,2})\s*dagen?\b/);
  if(days&&/(maak|duur|reis|plan).{0,18}\d{1,2}\s*dagen?/.test(text)){patch.days=clamp(Math.round(days),3,60);changes.push(`${patch.days} reisdagen`)}

  const euros=numberFrom(text,/(?:budget|max(?:imaal)?|onder)\s*€?\s*(\d{3,5})/);
  if(euros){patch.budget=Math.max(500,Math.round(euros));changes.push(`budget €${patch.budget}`)}

  if(/rustiger|meer rust|minder druk|ontspannender|minder rijden/.test(text)){
    patch.tripPace='relaxed'; optimizerMode='relaxed';
    if(!patch.maxDrive)patch.maxDrive=clamp(Number(trip.maxDrive||5)-1,2,10);
    patch.maxChanges=clamp(Number(trip.maxChanges||5)-1,0,20);
    changes.push('rustiger reistempo','minder hotelwissels');
  }
  if(/goedkoper|lagere kosten|besparen|budgetvriendelijk/.test(text)){
    optimizerMode='value'; changes.push('meer waarde per euro');
  }
  if(/actiever|meer doen|meer beleven|avontuurlijker/.test(text)){
    patch.tripPace='active';optimizerMode='active';changes.push('actiever reistempo');
  }
  if(/mooie route|mooier rijden|toeristisch|scenic|bochtige|bochten|passen/.test(text)){
    patch.routeStyle='scenic';changes.push('landschappelijke route');
  }
  if(/snelste route|sneller rijden|efficiënte route/.test(text)){
    patch.routeStyle='fastest';changes.push('snellere route');
  }
  if(/minder (?:hotel|accommodatie)?wissel|vaste basis|zelfde hotel|minder verhuizen/.test(text)){
    patch.maxChanges=clamp(Number(trip.maxChanges||5)-2,0,20);optimizerMode=optimizerMode||'relaxed';changes.push('minder accommodatiewissels');
  }
  if(/lus|loop/.test(text)){patch.routeTopology='loop';changes.push('lusroute')}
  if(/open einde|one way|enkele reis/.test(text)){patch.routeTopology='open-ended';changes.push('open-einde route')}
  if(/zelfde route terug|heen en terug/.test(text)){patch.routeTopology='out-and-back';changes.push('heen-en-terugroute')}

  const preferenceBoosts={};
  for(const [id,words] of Object.entries(prefAliases)){
    if(words.some(word=>text.includes(word)) && /(meer|belangrijk|focus|voorkeur|graag|veel|mooier|beste)/.test(text)){
      preferenceBoosts[id]=3;
      changes.push(`meer ${id}`);
    }
  }
  if(Object.keys(preferenceBoosts).length){
    patch.preferenceBoosts=preferenceBoosts;
  }

  if(!changes.length)return{
    understood:false,
    message:'Ik herken nog geen concrete wijziging. Probeer bijvoorbeeld “maximaal 4 uur rijden”, “meer cultuur”, “minder hotelwissels” of “maak de route mooier”.'
  };

  return{
    understood:true,
    summary:`Ik stel voor: ${[...new Set(changes)].join(' · ')}.`,
    patch,
    optimizerMode,
    requiresConfirmation:true
  };
}

export function applyAssistantPatch(trip,patch){
  const allowed=['days','maxDrive','maxChanges','budget','routeStyle','routeTopology','tripPace'];
  const next={...trip};
  for(const [key,value] of Object.entries(patch||{}))if(allowed.includes(key))next[key]=value;
  if(patch?.preferenceBoosts){
    const prefs=new Set(next.preferences||[]);
    const weights={...(next.preferenceWeights||{})};
    for(const [id,weight] of Object.entries(patch.preferenceBoosts)){prefs.add(id);weights[id]=weight}
    next.preferences=[...prefs];next.preferenceWeights=weights;
  }
  return next;
}
