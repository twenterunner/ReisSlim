import { DATASET_VERSION, validCoordinate } from './config.js';

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const tokens=s=>norm(s).split(/\s+/).filter(Boolean);
const cellKey=(lat,lon,size)=>`${Math.floor((Number(lat)+90)/size)}:${Math.floor((Number(lon)+180)/size)}`;

export function buildRegionSearch(regions=[]){
  const tokenMap=new Map(),prefixMap=new Map(),rows=new Map();
  for(const region of regions){
    rows.set(region.id,region);
    const bag=[region.name,region.country,...(region.tags||[]),...(region.searchTerms||[])].join(' ');
    for(const token of new Set(tokens(bag))){
      if(!tokenMap.has(token))tokenMap.set(token,new Set());tokenMap.get(token).add(region.id);
      const max=Math.min(24,token.length);for(let n=2;n<=max;n++){const prefix=token.slice(0,n);if(!prefixMap.has(prefix))prefixMap.set(prefix,new Set());prefixMap.get(prefix).add(region.id)}
    }
  }
  return {rows,tokenMap,prefixMap};
}
export function queryRegions(searchIndex,query,limit=20){
  const q=tokens(query);if(!q.length)return [...searchIndex.rows.values()].slice(0,limit);const scores=new Map(),add=(ids,weight)=>{for(const id of ids||[])scores.set(id,(scores.get(id)||0)+weight)};
  for(const token of q){
    add(searchIndex.tokenMap.get(token),4);
    if(token.length>=2)add(searchIndex.prefixMap?.get(token),2);
    for(let n=2;n<token.length;n++)add(searchIndex.tokenMap.get(token.slice(0,n)),2);
  }
  return [...scores.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([id])=>searchIndex.rows.get(id));
}

export function buildSpatialIndex(items=[],cellSizeDeg=2){
  const cells=new Map();
  for(const item of items){if(!validCoordinate(item))continue;const k=cellKey(item.lat,item.lon,cellSizeDeg);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(item)}
  return {cells,cellSizeDeg,itemsCount:items.length};
}
export function haversineKm(a,b){
  if(!validCoordinate(a)||!validCoordinate(b))return Infinity; const R=6371,rad=x=>Number(x)*Math.PI/180;
  const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),la=rad(a.lat),lb=rad(b.lat); const h=Math.sin(dLat/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function nearbySpatial(index,point,radiusKm=250,limit=50){
  if(!index||!validCoordinate(point)||limit<=0)return[];const dLat=radiusKm/111,dLon=radiusKm/(111*Math.max(.15,Math.cos(Number(point.lat)*Math.PI/180))),s=index.cellSizeDeg,keepN=Math.max(limit,limit*3),heap=[];
  const minI=Math.floor((point.lat-dLat+90)/s),maxI=Math.floor((point.lat+dLat+90)/s),minJ=Math.floor((point.lon-dLon+180)/s),maxJ=Math.floor((point.lon+dLon+180)/s);
  const swap=(a,b)=>{const t=heap[a];heap[a]=heap[b];heap[b]=t};const up=i=>{while(i>0){const p=(i-1)>>1;if(heap[p].approxKm>=heap[i].approxKm)break;swap(p,i);i=p}};const down=i=>{for(;;){let m=i,l=i*2+1,r=l+1;if(l<heap.length&&heap[l].approxKm>heap[m].approxKm)m=l;if(r<heap.length&&heap[r].approxKm>heap[m].approxKm)m=r;if(m===i)break;swap(i,m);i=m}};
  const keep=row=>{if(heap.length<keepN){heap.push(row);up(heap.length-1)}else if(row.approxKm<heap[0].approxKm){heap[0]=row;down(0)}};
  const lat0=Number(point.lat),lon0=Number(point.lon),cos0=Math.cos(lat0*Math.PI/180),kmPerDeg=111.32;
  for(let i=minI;i<=maxI;i++)for(let j=minJ;j<=maxJ;j++)for(const item of index.cells.get(`${i}:${j}`)||[]){const dy=(Number(item.lat)-lat0)*kmPerDeg,dx=(Number(item.lon)-lon0)*kmPerDeg*cos0,approxKm=Math.hypot(dx,dy);if(approxKm<=radiusKm*1.02)keep({item,approxKm})}
  return heap.map(x=>({item:x.item,distanceKm:haversineKm(point,x.item)})).filter(x=>x.distanceKm<=radiusKm).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,limit);
}


export class TravelDataClient{
  constructor({fetchImpl=globalThis.fetch,baseUrl='.'}={}){this.fetchImpl=fetchImpl;this.baseUrl=baseUrl;this.index=null;this.metadata=null;this.searchIndex=null;this.spatialIndex=null;this.countryCache=new Map()}
  async init(){
    if(this.index)return this;
    const [indexRes,metaRes]=await Promise.all([this.fetchImpl(`${this.baseUrl}/data-index.json`),this.fetchImpl(`${this.baseUrl}/data-metadata.json`)]);
    if(!indexRes.ok)throw new Error(`OFFLINE_DATA_INDEX_${indexRes.status}`); if(!metaRes.ok)throw new Error(`OFFLINE_DATA_METADATA_${metaRes.status}`);
    this.index=await indexRes.json();this.metadata=await metaRes.json(); if(this.index.datasetVersion!==DATASET_VERSION)throw new Error(`DATASET_VERSION_MISMATCH:${this.index.datasetVersion}`);
    this.searchIndex=buildRegionSearch(this.index.regions);this.spatialIndex=buildSpatialIndex(this.index.baseIndex,2);return this;
  }
  search(query,limit=20){if(!this.searchIndex)throw new Error('DATA_NOT_INITIALIZED');return queryRegions(this.searchIndex,query,limit)}
  resolveOrigin(text){
    if(!this.index)throw new Error('DATA_NOT_INITIALIZED'); const raw=String(text||'').trim(); const m=raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); if(m){const p={name:raw,lat:Number(m[1]),lon:Number(m[2]),source:'coordinate-input'};return validCoordinate(p)?p:null}
    const n=norm(raw); const choices=[...(this.index.originPlaces||[]),...(this.index.baseIndex||[])]; let hit=choices.find(x=>norm(x.name)===n); if(!hit)hit=choices.find(x=>norm(x.name).includes(n)||n.includes(norm(x.name))); return hit?{...hit,source:'offline-catalog'}:null;
  }
  async loadCountry(code){
    if(this.countryCache.has(code))return this.countryCache.get(code); const res=await this.fetchImpl(`${this.baseUrl}/data-country-${code}.json`); if(!res.ok)throw new Error(`COUNTRY_DATA_${code}_${res.status}`); const data=await res.json(); this.countryCache.set(code,data);return data;
  }
  async getRegion(regionId){
    const summary=this.index.regions.find(r=>r.id===regionId); if(!summary)return null; const country=await this.loadCountry(summary.countryCode); return country.regions.find(r=>r.id===regionId)||null;
  }
  countryInfo(code){return this.index.countries.find(c=>c.code===code)||null}
  nearbyBases(point,radiusKm=250,limit=50){return nearbySpatial(this.spatialIndex,point,radiusKm,limit).map(x=>({...x.item,distanceKm:x.distanceKm}))}
  stats(){return this.index?.totals||null}
}

export function createNodeDataClient(index,countries){
  const client=new TravelDataClient({fetchImpl:null});client.index=index;client.metadata={datasetVersion:index.datasetVersion,totals:index.totals};client.searchIndex=buildRegionSearch(index.regions);client.spatialIndex=buildSpatialIndex(index.baseIndex,2);for(const [k,v] of Object.entries(countries))client.countryCache.set(k,v);return client;
}
