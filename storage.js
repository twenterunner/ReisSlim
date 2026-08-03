const KEY='reisslim.trips.v1';
export function saveTrip(data){const all=JSON.parse(localStorage.getItem(KEY)||'[]');all.unshift({...data,savedAt:new Date().toISOString()});localStorage.setItem(KEY,JSON.stringify(all.slice(0,20)));return all.length}
export function clearCurrent(){localStorage.removeItem('reisslim.current')}
export function saveCurrent(data){localStorage.setItem('reisslim.current',JSON.stringify(data))}
export function loadCurrent(){try{return JSON.parse(localStorage.getItem('reisslim.current')||'null')}catch{return null}}
