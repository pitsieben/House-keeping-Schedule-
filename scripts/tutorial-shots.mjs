import {createRequire} from 'module'; const {chromium}=createRequire(import.meta.url)('playwright');
// Regenerates docs/tutorial/*.png with demo data. Needs a local server on :8080 (npm run serve) and Playwright:
//   NODE_PATH=$(npm root -g) node scripts/tutorial-shots.mjs
const OUT=new URL('../docs/tutorial/', import.meta.url).pathname;
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const p=await ctx.newPage();
p.on('dialog',d=>d.accept()); p.on('pageerror',e=>console.log('ERR',e.message));
await p.route('**/api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
const NOW='2026-11-19T09:30';
const go=async(me)=>{ await p.evaluate((me)=>{ if(me) localStorage.setItem('house-quest-me',me); else localStorage.removeItem('house-quest-me'); document.cookie='house-quest-me=; max-age=0; path=/'; },me); await p.reload(); await p.waitForTimeout(900); };
await p.goto('http://localhost:8080/?now='+NOW);
await p.evaluate(async(NOW)=>{
  const S=await import('/js/schedule.js'); const now=new Date(NOW);
  const st={completions:{},swaps:{},excused:{},avatars:{},log:{},fakes:{},flags:{}};
  const skip={paco:[3], hrithik:[5], pit:[]}; const cnt={paco:0,hrithik:0,pit:0};
  for(const d of S.dutiesBetween(S.parseYmd('2026-11-12'),now)){ if(d.deadline>now) continue; const w=d.assignee; cnt[w]++;
    if(skip[w].includes(cnt[w])) continue; st.completions[d.id]={by:w,at:d.deadline-2*3600e3}; }
  // yesterday's (Wed 18) evening: claimed by its assignee but faked, still up for grabs
  const ev=S.dutiesForDate(S.parseYmd('2026-11-18')).find(x=>x.kind==='evening');
  st.completions[ev.id]={by:ev.assignee,at:ev.deadline-3600e3}; st.fakes[ev.id]={by:'pit',at:now-2*3600e3};
  // a pending swap request Paco -> Hrithik for Saturday morning
  const sat=S.dutiesForDate(S.parseYmd('2026-11-21')).find(x=>x.kind==='morning');
  st.swaps[sat.id]={from:sat.assignee,to:'hrithik',status:'pending',at:now-3600e3};
  const L=(t,txt)=>{st.log[t+'-x']={t,text:txt}};
  L(now-3600e3,'Pit completed morning reset (+10)'); L(now-2*3600e3,"🛡 Admin: "+ev.assignee+"'s evening reset wasn't really done — 2× penalty. Anyone can steal it for 24 h!");
  localStorage.setItem('house-quest-state-v2',JSON.stringify(st)); localStorage.removeItem('house-quest-pending-v2');
  console.log(ev.assignee, sat.assignee);
},NOW);
const shot=async(name,sel)=>{ if(sel){ const el=await p.$(sel); await el.scrollIntoViewIfNeeded(); await el.screenshot({path:OUT+name}); } else await p.screenshot({path:OUT+name}); console.log('saved',name); };
await go(null); await shot('1-pick-name.png');
await go('hrithik'); await p.evaluate(()=>window.scrollTo(0,0)); await shot('2-today.png');
await p.addStyleTag({content:'header.top{position:static!important}'});
await shot('3-leaderboard.png','.scene');
await shot('4-swap-request.png','.banner.swap');
await shot('5-your-duty.png','.duty.mine');
await p.click('.duty.mine [data-act="swapopen"]'); await p.waitForTimeout(200); await shot('6-swap.png','.duty.mine');
await shot('7-steal.png','[data-act="steal"] >> xpath=ancestor::article');
// flag button on someone else's done duty: look in schedule? use today's weekly grid or other card
await p.click('[data-tab="rules"]'); await p.waitForTimeout(300);
await shot('8-token.png','form[data-act="settoken"] >> xpath=ancestor::div[contains(@class,"card")]');
await p.click('[data-tab="ranks"]'); await p.waitForTimeout(300); await p.evaluate(()=>window.scrollTo(0,0)); await shot('9-ranks.png');
await p.click('[data-tab="cal"]'); await p.waitForTimeout(300); await p.evaluate(()=>window.scrollTo(0,0)); await shot('10-calendar.png');
await b.close();
// admin screenshot (Pit)
const b2=await chromium.launch(); const c2=await b2.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}); const q=await c2.newPage();
q.on('dialog',d=>d.accept()); await q.route('**/api.github.com/**',r=>r.fulfill({status:404,body:'{}'}));
await q.goto('http://localhost:8080/?now='+NOW);
await q.evaluate(()=>{ localStorage.setItem('house-quest-me','pit'); });
await q.evaluate(async(NOW)=>{ const S=await import('/js/schedule.js'); const now=new Date(NOW);
  const st={completions:{},swaps:{},excused:{},avatars:{},log:{},fakes:{},flags:{}};
  for(const d of S.dutiesBetween(S.parseYmd('2026-11-17'),now)){ if(d.deadline>now) continue; st.completions[d.id]={by:d.assignee,at:d.deadline-2*3600e3}; }
  const ev=S.dutiesForDate(S.parseYmd('2026-11-18')).find(x=>x.kind==='evening'); st.flags[ev.id]={by:'hrithik',at:now-3600e3};
  localStorage.setItem('house-quest-state-v2',JSON.stringify(st)); localStorage.removeItem('house-quest-pending-v2'); },NOW);
await q.reload(); await q.waitForTimeout(800);
await q.click('[data-tab="admin"]'); await q.fill('input[name=pin]','demo-pin-123'); await q.click('form[data-act="adminset"] button'); await q.waitForTimeout(3200);
await q.evaluate(()=>window.scrollTo(0,0)); await q.screenshot({path:OUT+'11-admin.png'}); console.log('saved 11-admin.png');
await b2.close();
