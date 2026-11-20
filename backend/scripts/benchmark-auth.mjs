// Bounded, offline benchmark. Results are local Node metrics, not Cloudflare isolate metrics.
import { performance } from 'node:perf_hooks';
import worker from '../worker.js';
import { testDatabase } from '../tests/helpers.mjs';

const origin='https://offline.example.test';
const env={DB:testDatabase(),RADIO_FEATURES_ENABLED:'true',REGISTRATION_ENABLED:'true',ALLOWED_ORIGIN:origin,AUTH_RATE_SECRET:'offline-only'};
const password='synthetic-benchmark-password-123';
async function post(path,username){
 const response=await worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'content-type':'application/json','CF-Connecting-IP':'192.0.2.10'},body:JSON.stringify({username,password})}),env);
 if(response.status!==200&&response.status!==201)throw Error(`${path} returned ${response.status}`);
}
const names=['bench_one','bench_two','bench_three','bench_four'];
for(const name of names)await post('/api/auth/register',name);
async function measure(label,users){
 const baseline=process.memoryUsage().rss;
 let peak=baseline;
 const timer=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss)},5);
 const cpu=process.cpuUsage(),start=performance.now();
 try{await Promise.all(users.map(name=>post('/api/auth/login',name)))}finally{clearInterval(timer)}
 const elapsed=performance.now()-start,used=process.cpuUsage(cpu);
 console.log(JSON.stringify({label,requests:users.length,wallMs:Math.round(elapsed),processCpuMs:Math.round((used.user+used.system)/1000),baselineRssMiB:Math.round(baseline/1048576),peakRssMiB:Math.round(peak/1048576)}));
}
await measure('sequential',names.slice(0,1));
await measure('concurrent',names);
