// Read-only browser QA of the existing staging UI with local synthetic accounts.
// No registration, competition award, Clubhouse or production requests.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const origin='https://ava-radio-staging.ibbo-abdoli.workers.dev';
const accounts=JSON.parse(await readFile(new URL('../../backend/.wrangler/staging-qa-credentials.json',import.meta.url),'utf8'));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 const roles=[];
 for(const account of accounts){
  const context=await browser.newContext({viewport:{width:390,height:850}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const response=await page.goto(origin+'/v2/radio-club.html',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector('#auth')?.hidden===false);
  await page.locator('#auth-form [name=username]').fill(account.username);
  await page.locator('#auth-form [name=password]').fill(account.password);
  await page.locator('#auth-form [value=login]').click();
  await page.waitForFunction(()=>document.querySelector('#account')?.hidden===false);
  const admin=await page.locator('#competition-admin').isVisible();roles.push(admin?'admin':'listener');
  if(admin){
   await page.waitForFunction(()=>document.querySelector('#competition-admin-list')?.textContent?.includes('QA synthetic competition'));
   assert.match(await page.locator('#system-status').textContent(),/ثبت‌نام عمومی بسته/);
   assert.match(await page.locator('#system-status').textContent(),/مشاهدهٔ حضور غیرفعال/);
   assert.ok(await page.locator('#users form').count()>=1);
  }else{
   assert.equal(await page.locator('#competition-admin').isVisible(),false);
   await page.waitForFunction(()=>document.querySelector('#my-competition-results')?.textContent?.includes('هنوز نتیجه‌ای'));
  }
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});const size=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(size.scrollWidth<=size.viewport+1,'portal overflow at '+width)}
  assert.deepEqual(errors,[]);
  await page.locator('#logout').click();await page.waitForFunction(()=>document.querySelector('#auth')?.hidden===false);
  await context.close();
 }
 assert.ok(roles.includes('admin')&&roles.includes('listener'));
 console.log(JSON.stringify({staging:origin,accounts:roles.length,roles:roles.sort(),widths:[390,1440],adminControls:true,publicRegistration:false,attendanceObserver:false,logout:true,externalRequests:'blocked'}));
}finally{if(browser)await browser.close()}
