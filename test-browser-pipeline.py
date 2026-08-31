#!/usr/bin/env python3
import contextlib, http.server, json, os, re, socketserver, threading, time, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent
REPORT=ROOT/'report-browser-pipeline.json'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
class Server(socketserver.ThreadingMixIn,http.server.HTTPServer): daemon_threads=True

def start_server():
    handler=lambda *a,**k: Quiet(*a,directory=str(ROOT),**k)
    srv=Server(('127.0.0.1',0),handler);threading.Thread(target=srv.serve_forever,daemon=True).start();return srv

def controlled_route(route):
    req=route.request;url=req.url
    if 'router.project-osrm.org' in url:
        m=re.search(r'/driving/([^?]+)',url); coords=[]
        if m:
            for pair in m.group(1).split(';'):
                lon,lat=pair.split(',')[:2];coords.append([float(lon),float(lat)])
        body={'routes':[{'distance':max(1000,50000*max(1,len(coords)-1)),'duration':max(600,1800*max(1,len(coords)-1)),'geometry':{'coordinates':coords,'type':'LineString'}}]}
        route.fulfill(status=200,content_type='application/json',body=json.dumps(body));return
    if 'overpass-api.de' in url:
        posted=req.post_data or ''
        q=urllib.parse.parse_qs(posted).get('data',[''])[0]
        m=re.search(r'around:(?:\d+),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)',q)
        lat,lon=(51.8,10.6) if not m else (float(m.group(1)),float(m.group(2)))
        if 'hotel|guest_house|hostel|camp_site|caravan_site' in q:
            els=[{'type':'node','id':99001,'lat':lat+.001,'lon':lon+.001,'tags':{'name':'Controlled Harz Stay','tourism':'hotel'}}]
        else:
            els=[{'type':'node','id':88001,'lat':lat+.002,'lon':lon+.002,'tags':{'name':'Controlled Harz Viewpoint','tourism':'viewpoint'}}]
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'elements':els}));return
    if 'api.open-meteo.com' in url:
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'daily':{'temperature_2m_max':[20],'temperature_2m_min':[10],'precipitation_probability_max':[10]}}));return
    if 'commons.wikimedia.org' in url:
        body={'query':{'pages':{'1':{'title':'Harz landscape','imageinfo':[{'thumburl':'https://example.invalid/harz.jpg','extmetadata':{'ImageDescription':{'value':'Harz mountains'}}}]}}}}
        route.fulfill(status=200,content_type='application/json',body=json.dumps(body));return
    if 'example.invalid/harz.jpg' in url:
        route.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');return
    route.continue_()

def fill_harz(page,live):
    page.fill('#origin','Saasveld');page.fill('#destinationQuery','Harz');page.fill('#days','5');page.select_option('#transport','motorcycle');page.select_option('#tripStructure','base');page.select_option('#routeTopology','loop');page.fill('#maxDrive','5');page.fill('#maxChanges','5');
    checked=page.is_checked('#liveData')
    if live != checked: page.click('#liveData')

def assert_plan(page,live_expected=False):
    page.wait_for_selector('#planView:not(.hidden)',timeout=5000);page.wait_for_function("document.querySelectorAll('#days article.day').length===5",timeout=5000)
    assert page.locator('#days article.day').count()==5
    assert 'Harz' in page.locator('#tripTitle').inner_text()
    text=page.locator('#validation').inner_text();assert 'geldig' in text.lower(),text
    assert page.locator('#map svg').count()==1
    nights=page.locator('#days .night').count();assert nights==4,nights
    if live_expected:
        page.wait_for_function("document.querySelector('#status').textContent.includes('Plan klaar')",timeout=15000)
        assert 'live route' in page.locator('#tripMeta').inner_text().lower()
        assert 'live-all' in page.locator('#enrichment').inner_text()

def main():
    srv=start_server();base=f'http://127.0.0.1:{srv.server_port}/index.html';report={'result':'FAIL','checks':[],'limitations':['External providers were controlled/intercepted; this browser run did not verify third-party service availability.']}
    try:
      with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(accept_downloads=True);page=context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
        # Controlled-live complete UI pipeline.
        page.route('**/*',controlled_route);page.goto(base,wait_until='networkidle');fill_harz(page,True);page.click('button[type=submit]')
        # Structural rendering must be present while live work is in flight / before final status.
        page.wait_for_selector('#planView:not(.hidden)',timeout=5000);assert page.locator('#days article.day').count()==5
        assert_plan(page,True);report['checks'].append('controlled-live user input → offline canonical render → enrichment → authoritative validation → map: PASS')
        # Save and browser reload restoration/library.
        page.click('#saveTripBtn');page.reload(wait_until='networkidle');page.wait_for_selector('#savedTrips .saved',timeout=5000);assert page.locator('#savedTrips .saved').count()>=1;page.locator('#savedTrips [data-load]').first.click();assert_plan(page,False);report['checks'].append('storage save → reload → restoration: PASS')
        # Service worker install/control, then total network outage reload and offline trip generation.
        page.evaluate("navigator.serviceWorker.ready.then(()=>true)");page.reload(wait_until='networkidle');page.wait_for_function("navigator.serviceWorker.controller!==null",timeout=10000)
        context.set_offline(True);page.reload(wait_until='domcontentloaded',timeout=10000);page.wait_for_selector('#planForm',timeout=5000);fill_harz(page,False);page.click('button[type=submit]');assert_plan(page,False);assert 'Offline plan klaar' in page.locator('#status').inner_text();report['checks'].append('service-worker controlled TOTAL network outage reload + offline data + plan + map: PASS')
        context.set_offline(False)
        # Offline GPX button exercises shipped download path.
        with page.expect_download(timeout=5000) as di: page.click('#gpxBtn')
        dl=di.value;assert dl.suggested_filename.endswith('.gpx');report['checks'].append('browser GPX export: PASS')
        assert not errors,errors
        report['checks'].append('uncaught browser errors: 0')
        browser.close();report['result']='PASS'
    finally: srv.shutdown();REPORT.parent.mkdir(parents=True,exist_ok=True);REPORT.write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report,indent=2))
if __name__=='__main__': main()
