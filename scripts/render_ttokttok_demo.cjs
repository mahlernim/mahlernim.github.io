// Optional media build. Requires Playwright (Chromium) and ffmpeg on PATH.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const out = path.resolve(__dirname, '../ttokttok/assets');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttokttok-demo-'));
const stages = [
  ['매달 자가검침,', '이제 자동으로.', '평소 확인한 계량기 숫자가 자동화의 시작이에요.', '기록 준비', '최근 실측', '121.4', '3일 전에 계량기를 확인했어요', '✓ 실제 숫자를 저장했어요'],
  ['우리 집 사용 흐름으로', '오늘의 지침을 추정해요.', '작년 계절 흐름에 최근 실측을 반영합니다.', '지침 추정', '현재 예상 지침', '124.6', '누적 지침 · m³', '✓ 최근 생활 패턴을 반영했어요'],
  ['검침 기간 마지막 날,', '제출 조건을 확인해요.', '자동 제출을 켠 경우에만 진행합니다.', '조건 확인', '자동 제출', 'ON', '검침 기간과 기존 제출 상태 확인', '✓ 최근 실측과 이전 지침도 확인해요'],
  ['조건이 맞으면,', '이번 달 제출 완료.', '계량기는 틈날 때, 제출은 때에 맞게.', '제출 완료', '이번 달 자가검침', 'OK', '조건을 충족하면 공급사로 전송', '✓ 공급사에서 제출 완료를 확인했어요']
];
function html(i){const s=stages[i];return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#eef0e5;color:#193c35;font-family:'Malgun Gothic',sans-serif}.frame{width:960px;height:720px;padding:42px 54px;position:relative}.top{display:flex;justify-content:space-between;font-size:14px;font-weight:bold}.badge{font-size:12px;border:1px solid #99aea0;padding:4px 10px;border-radius:20px}.title{font-size:40px;letter-spacing:-2px;line-height:1.35;margin:32px 0 10px;font-weight:bold}.title span{color:#086b5d}.desc{font-size:17px;color:#596e63}.card{background:white;border-radius:20px;margin-top:27px;padding:25px 32px;display:flex;align-items:center;gap:35px;box-shadow:0 10px 30px #193c3510}.value{font-size:56px;font-family:monospace;font-weight:bold;letter-spacing:2px;background:#164c40;color:white;border-radius:12px;padding:17px 26px;min-width:260px;text-align:center}.label{font-size:16px;font-weight:bold}.sub{font-size:13px;color:#596e63;line-height:1.9}.done{margin:21px 0 0;font-size:16px;color:#086b5d;font-weight:bold}.steps{display:flex;gap:12px;margin-top:34px}.step{flex:1;border-top:4px solid #ced8cb;padding-top:12px;font-size:13px;color:#667c6e}.active{border-color:#086b5d;color:#086b5d;font-weight:bold}.foot{position:absolute;bottom:27px;font-size:12px;color:#607365}.num{color:#ca5b30;margin-right:7px}</style><div class="frame"><div class="top"><span>똑똑 자가검침 AI</span></div><h1 class="title">${s[0]}<br><span>${s[1]}</span></h1><div class="desc">${s[2]}</div><div class="card"><div class="value">${s[5]}</div><div><div class="label">${s[4]}</div><p class="sub">${s[6]}</p></div></div><p class="done">${s[7]}</p><div class="steps">${stages.map((x,j)=>`<div class="step ${j<=i?'active':''}"><span class="num">0${j+1}</span>${x[3]}</div>`).join('')}</div><div class="foot">ahn-lab.org/ttokttok/</div></div></html>`;}
async function main(){
 const browser=await chromium.launch({headless:true, channel:process.env.BROWSER_CHANNEL || 'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
  for(let i=0;i<4;i++){
   // The value and label are intentionally rendered from synthetic data only.
   const markup=html(i);
   await page.setContent(markup); await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:path.join(tmp,`${i}.png`)});
   if(i===0) await page.screenshot({path:path.join(out,'poster.png')});
   const clip=spawnSync('ffmpeg',['-y','-loop','1','-i',path.join(tmp,`${i}.png`),'-t','5','-vf','fade=t=in:st=0:d=0.25,fade=t=out:st=4.75:d=0.25,format=yuv420p','-r','24','-c:v','libx264','-crf','22',path.join(tmp,`${i}.mp4`)],{encoding:'utf8'});
   if(clip.status!==0)throw new Error(clip.stderr);
  }
  const list=path.join(tmp,'clips.txt');fs.writeFileSync(list,[0,1,2,3].map(i=>`file '${path.join(tmp,`${i}.mp4`).replaceAll('\\','/')}'`).join('\n'));
  const join=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',path.join(out,'demo.mp4')],{encoding:'utf8'});if(join.status!==0)throw new Error(join.stderr);
  await page.setViewportSize({width:1200,height:630});
  await page.setContent(`<body style="margin:0;background:#164c40;color:#faf9f3;font-family:'Malgun Gothic',sans-serif"><div style="padding:65px 80px"><p style="font-size:24px;color:#c5d7b1">똑똑 자가검침 AI</p><h1 style="font-size:78px;line-height:1.3;letter-spacing:-4px;margin:30px 0">매달 자가검침,<br>이제 자동으로.</h1><p style="font-size:25px;color:#d1dfd5">평소에 확인하고, 검침 기간엔 자동 제출.</p><p style="font-size:18px;color:#bdcfbb">Android 무료 테스트 · 전국 30곳 공급사 연결 · ahn-lab.org/ttokttok/</p></div></body>`);
  await page.screenshot({path:path.join(out,'share.png')});
 } finally {await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
 console.log('Created 20-second demo.mp4, poster.png and share.png');
}
main().catch(e=>{console.error(e);process.exitCode=1});
