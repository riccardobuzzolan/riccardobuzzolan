const fs=require('node:fs'), {spawn}=require('node:child_process');
(async()=>{
const targets=JSON.parse(process.env.PAGES);
const chrome=spawn('google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=9222','--user-data-dir=/tmp/rb-visual-chrome','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ready=false;for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:9222/json/version');if(r.ok){ready=true;break}}catch{}await sleep(200)}if(!ready)throw Error('Chrome CDP unavailable');
let page=await(await fetch('http://127.0.0.1:9222/json/new?capture',{method:'PUT'})).json();
let ws=new WebSocket(page.webSocketDebuggerUrl),counter=0,pending=new Map();
await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true})});
ws.addEventListener('message',event=>{let x=JSON.parse(event.data);if(x.id&&pending.has(x.id)){let z=pending.get(x.id);pending.delete(x.id);x.error?z.reject(Error(JSON.stringify(x.error))):z.resolve(x.result)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{let id=++counter;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{let o=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return o.result?.value};
await send('Page.enable');await send('Runtime.enable');
for(const [desktop,mobile,url,anchor] of targets){
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url});await sleep(6500);
 let ok=await evaluate(`(()=>{let reject=document.querySelector('#sitePrivacyReject')||[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Rifiuta');if(reject)reject.click();let el=document.getElementById(${JSON.stringify(anchor)});if(el)el.scrollIntoView({block:'start'});return {title:document.title,visibility:!!el,clicked:!!reject,href:location.href}})()`);
 console.log('Desktop check',url,JSON.stringify(ok));if(!ok?.title)throw Error('No title: '+url);if(anchor&&!ok.visibility)throw Error('Missing target: '+anchor);
 await sleep(1300);let pic=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync('docs/images/'+desktop,Buffer.from(pic.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await sleep(1500);
 await evaluate(`(()=>{let el=document.getElementById(${JSON.stringify(anchor)});if(el)el.scrollIntoView({block:'start'});})()`);
 let view=await evaluate(`({width:document.documentElement.scrollWidth,inner:innerWidth,title:document.title})`);
 console.log('Mobile check',url,JSON.stringify(view));if(view.width>view.inner+35)console.log('WARN horizontal overflow: '+url);
 await sleep(800);pic=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync('docs/images/'+mobile,Buffer.from(pic.data,'base64'));
}
ws.close();chrome.kill();

})().catch(e=>{console.error(e);process.exitCode=1});
