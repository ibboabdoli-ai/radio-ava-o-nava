// Isolated Chromium check: all external requests are mocked or blocked.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 let path;try{path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname))}catch{res.writeHead(400).end();return}
 if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return}
 try{const bytes=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'}).end(bytes)}catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const ids={admin:'00000000-0000-4000-8000-000000000001',listener:'00000000-0000-4000-8000-000000000002',competition:'00000000-0000-4000-8000-000000000003'};
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 const page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 let balance=0,competition=null,manualCalls=0,awardCalls=0;
 await page.route('**/*',route=>{
  const url=route.request().url();if(url.startsWith(base+'/'))return route.continue();return route.abort();
 });
 await page.route('**/request-config.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({apiBase:'https://api.example.test',clubEnabled:true,features:{requests:false,queue:false,leaderboard:false}})}));
 await page.route('https://api.example.test/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method();
  const headers={'access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type,idempotency-key','content-type':'application/json'};
  const reply=(body,status=200)=>route.fulfill({status,headers,body:JSON.stringify(body)});
  if(method==='OPTIONS')return route.fulfill({status:204,headers,body:''});
  if(path==='/api/me')return reply({user:{id:ids.admin,username:'qaadmin',role:'admin',balance,leaderboardOptIn:false}});
  if(path==='/api/me/dashboard')return reply({dashboard:{balance,earned:balance,spent:0,verifiedSeconds:0,pending:0,approved:0,rank:null}});
  if(path==='/api/me/transactions')return reply({transactions:[]});
  if(path==='/api/me/competition-results')return reply({results:[]});
  if(path==='/api/me/requests')return reply({requests:[]});
  if(path==='/api/me/attendance')return reply({sessions:[]});
  if(path==='/api/me/clubhouse-identity')return reply({linked:false,clubhouseUserId:null});
  if(path==='/api/catalog')return reply({songs:[]});
  if(path==='/api/queue')return reply({queue:[]});
  if(path==='/api/leaderboard')return reply({leaders:[]});
  if(path==='/health')return reply({featuresEnabled:true,registrationEnabled:false,attendanceObserverEnabled:false});
  if(path==='/api/admin/events')return reply({events:[]});
  if(path==='/api/admin/transactions')return reply({transactions:[]});
  if(path==='/api/admin/requests')return reply({requests:[]});
  if(path==='/api/admin/users')return reply({users:[{id:ids.admin,username:'qaadmin',balance},{id:ids.listener,username:'qauser',balance:balance}]});
  if(path==='/api/competitions')return reply({competitions:competition?.status==='published'?[{id:ids.competition,title:competition.title,description:competition.description,rules:competition.rules,status:'published',results:competition.result?.publicNameConsent&&competition.result?.publicApproved?[{displayName:'<img src=x onerror=alert(1)>',placement:1,result_text:competition.result.resultText}]:[]}]:[]});
  if(path==='/api/admin/competitions'&&method==='GET')return reply({competitions:competition?[{id:ids.competition,title:competition.title,description:competition.description,rules:competition.rules,status:competition.status,results_public:competition.resultsPublic?1:0,participants:competition.participant?[{user_id:ids.listener,username:'qauser'}]:[],results:competition.result?[{user_id:ids.listener,username:'qauser',placement:1,result_text:competition.result.resultText,is_winner:1,public_approved:competition.result.publicApproved?1:0,public_name_consent:competition.result.publicNameConsent?1:0,awarded_points:competition.awarded?4:null}]:[]}]:[]});
  if(path==='/api/admin/competitions'&&method==='POST'){const data=JSON.parse(req.postData());competition={...data,status:'draft',resultsPublic:false};return reply({id:ids.competition},201)}
  if(path==='/api/admin/competitions/'+ids.competition&&method==='PATCH'){Object.assign(competition,JSON.parse(req.postData()));return reply({ok:true})}
  if(path.endsWith('/participants')&&method==='POST'){const data=JSON.parse(req.postData());assert.equal(data.verifiedFromApprovedForm,true);competition.participant=true;return reply({ok:true},201)}
  if(path.endsWith('/results')&&method==='POST'){const data=JSON.parse(req.postData());assert.equal(Object.hasOwn(data,'publicNameConsent'),false);competition.result={...data,publicNameConsent:true};return reply({ok:true})}
  if(path.endsWith('/awards')&&method==='POST'){awardCalls++;assert.match(req.headers()['idempotency-key'],/^[a-f0-9-]{36}$/);competition.awarded=true;return reply({ok:true,balance:4},201)}
  if(path.endsWith('/adjust-points')&&method==='POST'){manualCalls++;assert.match(req.headers()['idempotency-key'],/^[a-f0-9-]{36}$/);const data=JSON.parse(req.postData());assert.equal(data.note,'بررسی آزمایشی');balance+=data.delta;return reply({ok:true,balance})}
  return reply({error:'not_found'},404);
 });
 await page.goto(base+'/v2/radio-club.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#competition-admin')?.hidden===false);
 await page.locator('[data-competition-tool=create]').click();
 await page.locator('#competition-create-form [name=title]').fill('مسابقهٔ ساختگی');
 await page.locator('#competition-create-form [name=description]').fill('فقط برای آزمون');
 await page.locator('#competition-create-form [name=rules]').fill('قانون یک');
 await page.locator('#competition-create-form button').click();
 await page.waitForFunction(()=>document.querySelector('#competition-edit-form [name=competitionId]')?.options.length===1);
 await page.locator('[data-competition-tool=edit]').click();
 await page.locator('#competition-edit-form [name=status]').selectOption('published');
 await page.locator('#competition-edit-form [name=resultsPublic]').check();
 await page.locator('#competition-edit-form button').click();
 await page.waitForFunction(()=>document.querySelector('#competition-public-list')?.textContent?.includes('مسابقهٔ ساختگی'));
 assert.equal(await page.locator('#competition-public-list img').count(),0);
 await page.locator('[data-competition-tool=participant]').click();
 await page.locator('#competition-participant-form [name=userId]').selectOption(ids.listener);
 await page.locator('#competition-participant-form [name=verifiedFromApprovedForm]').check();
 await page.locator('#competition-participant-form button').click();
 await page.waitForFunction(()=>document.querySelector('#competition-result-form [name=userId]')?.options.length===1);
 await page.locator('[data-competition-tool=result]').click();
 await page.locator('#competition-result-form [name=placement]').fill('1');
 await page.locator('#competition-result-form [name=resultText]').fill('نتیجهٔ ساختگی');
 await page.locator('#competition-result-form [name=isWinner]').check();
 await page.locator('#competition-result-form [name=publicApproved]').check();
 await page.locator('#competition-result-form button').click();
 await page.waitForFunction(()=>document.querySelector('#competition-public-list')?.textContent?.includes('نتیجهٔ ساختگی'));
 assert.equal(await page.locator('#competition-public-list img').count(),0);
 await page.locator('[data-competition-tool=award]').click();
 await page.locator('#competition-award-form [name=points]').fill('4');
 await page.locator('#competition-award-form [name=reason]').fill('جایزهٔ ساختگی');
 await page.locator('#competition-award-form button').click();
 await page.waitForFunction(()=>document.querySelector('#notice')?.textContent?.includes('جایزه ثبت شد'));
 assert.equal(awardCalls,1);
 await page.locator('#club-menu summary').click();
 await page.locator('#club-menu-admin').click();
 const row=page.locator('#users > div').filter({hasText:'qauser'});
 await row.locator('input[type=number]').fill('2');await row.locator('input:not([type=number])').fill('بررسی آزمایشی');await row.locator('button').click();
 await page.waitForFunction(()=>document.querySelector('#notice')?.textContent?.includes('تغییر امتیاز ثبت شد'));
 assert.equal(manualCalls,1);
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});const size=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(size.scrollWidth<=size.viewport+1,'horizontal overflow '+width)}
 assert.deepEqual(errors,[]);
 const home=await browser.newPage({viewport:{width:390,height:850}}),homeErrors=[];home.on('pageerror',error=>homeErrors.push(error.message));
 await home.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 await home.route('**/request-config.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({apiBase:base,clubEnabled:true})}));
 await home.route('**/api/competitions',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({competitions:[{title:'مسابقهٔ آزمایشی',results:[{displayName:'<img src=x onerror=alert(1)>',result_text:'نتیجهٔ تأییدشده'}]}]})}));
 await home.goto(base+'/v2/index.html',{waitUntil:'domcontentloaded'});
 await home.waitForFunction(()=>document.querySelector('#contestResults')?.textContent?.includes('نتیجهٔ تأییدشده'));
 assert.equal(await home.locator('#contestResults img').count(),0);
 assert.deepEqual(homeErrors,[]);
 await home.close();
 console.log(JSON.stringify({browser:'Chromium',manualCalls,awardCalls,competitionFlow:'passed',widths:[390,1440],externalRequests:'blocked'}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
