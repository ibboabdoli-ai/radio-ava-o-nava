// Browser-only QA for the staged listener club. Run with Node 22 + Playwright.
// Never connects to Clubhouse, paid AI, live API or production databases.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const type={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
const server=createServer(async(req,res)=>{
  let path;
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    path=resolve(root,'.'+decodeURIComponent(url.pathname));
  }catch{res.writeHead(400).end();return;}
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
    const data=await readFile(path);
    res.writeHead(200,{'content-type':type[extname(path)]||'application/octet-stream','cache-control':'no-store'});
    res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const results=[];
  for(const width of [360,390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**',route=>route.abort());
    await page.route('https://fonts.gstatic.com/**',route=>route.abort());
    const response=await page.goto(base+'/v2/request-song.html',{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    await page.waitForFunction(()=>document.querySelector('#clubStatusText')?.textContent?.includes('راه‌اندازی'));
    const measurements=await page.evaluate(()=>({
      viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      buttonDisabled:document.querySelector('#requestSubmit').disabled,
      queueCount:document.querySelector('#queueCount').textContent,
      heading:document.querySelector('#clubTitle')?.textContent,
      telegram:document.querySelector('#clubTelegramLink')?.href||'',
      rtl:document.documentElement.dir
    }));
    assert.equal(measurements.rtl,'rtl');
    assert.match(measurements.heading,/باشگاه شنوندگان/);
    assert.equal(measurements.buttonDisabled,true);
    assert.equal(measurements.queueCount,'—');
    assert.ok(measurements.scrollWidth<=measurements.viewport+1,'horizontal overflow '+width+'px: '+measurements.scrollWidth);
    assert.match(measurements.telegram,/^https:\/\/t\.me\//);
    assert.deepEqual(errors,[],'page JavaScript exceptions at '+width);
    if(width===390||width===1440){
      await page.screenshot({path:'.qa-listener-'+width+'.png',fullPage:true,animations:'disabled'});
    }
    results.push({width,ok:true});
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844}});
  let submitted=0;
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://fonts.gstatic.com/**',route=>route.abort());
  await page.route('**/request-config.json',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({apiBase:'https://api.example.test',features:{requests:true,queue:true,leaderboard:false}})
  }));
  await page.route('https://api.example.test/**',async route=>{
    const request=route.request();
    const headers={
      'access-control-allow-origin':base,
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'content-type',
      'content-type':'application/json'
    };
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
    if(request.url().endsWith('/api/queue'))return route.fulfill({
      status:200,headers,body:JSON.stringify({queue:[{id:'1',title:'آهنگ آزمایشی',artist:'خواننده'}]})
    });
    if(request.url().endsWith('/api/requests')){
      submitted++;
      assert.equal(request.method(),'POST');
      const body=JSON.parse(request.postData());
      assert.equal(body.title,'ترانه تست');
      return route.fulfill({status:201,headers,body:JSON.stringify({id:'2',status:'pending'})});
    }
    return route.fulfill({status:404,headers,body:'{}'});
  });
  await page.goto(base+'/v2/request-song.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#requestSubmit')?.disabled===false);
  await page.locator('#songTitle').fill('ترانه تست');
  await page.locator('#songArtist').fill('هنرمند تست');
  await page.locator('#requester').fill('شنونده تست');
  await page.locator('#requestSubmit').click();
  await page.waitForFunction(()=>document.querySelector('#requestFeedback')?.textContent?.includes('درخواست ثبت شد'));
  assert.equal(submitted,1);
  assert.equal(await page.locator('#queueCount').textContent(),'1');
  assert.equal(await page.locator('#queueList li').count(),1);
  results.push({scenario:'mocked HTTPS API and real browser form flow',ok:true});
  await page.close();
  console.log(JSON.stringify({browser:'Chromium',results},null,2));
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
