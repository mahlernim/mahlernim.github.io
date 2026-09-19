/*! Android estimator and public codec port. Copyright (c) 2026 mahlernim. MIT License, see /ttokttok/app/LICENSE.txt. */
export type UsagePeriod = {
  start: string; end: string; usage: number; meter: string;
  previous: number | null; current: number | null; billMonth: string;
  amount: number | null; unitCost: number | null; baseCost: number | null;
};
export type Observation = { time: number; reading: number; meter: string; predicted: number | null };
export type Profile = {
  providerId: string; meter: string; contract: string; plannedDate: string | null; syncTime: number | null;
  reminder: boolean; reminderDay: number; reminderHour: number; reminderRepeatCount: number; customerNumber: string;
  reconnectRequired: false;
};
export type SubmissionSettings = {
  enabled: boolean; automatic: false; requireRecentCheck: boolean; recentDays: number;
  reminder: false; reminderHour: number; reminderMinute: number;
};
export type SubmissionRecord = {
  cycle: string; periodStart: string; periodEnd: string; value: number; attemptedAt: number;
  status: 'pending' | 'confirmed' | 'uncertain' | 'rejected'; detail: string;
  confirmationSource: 'provider_response' | 'readback' | null;
};
export type GasappBill = { month: string; usage: number | null; amount: number | null; start: string | null; end: string | null };
export type SamchullyBill = { month: string; start: string | null; end: string | null; previous: number | null; current: number | null; usage: number | null; amount: number | null; meter: string | null };
export type EnergyTalkBill = { month: string; usage: string; amount: string; unit: string | null };
export type DirectBill = { month: string; usage: number | null; amount: number | null; start: string | null; end: string | null; previous: number | null; current: number | null; meterId: string | null };
export type AppData = {
  profile: Profile; periods: UsagePeriod[]; observations: Observation[]; submissionSettings: SubmissionSettings;
  submissions: SubmissionRecord[]; ready: boolean; gasappBills: GasappBill[]; samchullyBills: SamchullyBill[];
  energyTalkBills: EnergyTalkBill[]; directBills: DirectBill[];
};
export type Estimate = { reading: number | null; daily: number | null; source: string; ageDays: number | null; anchorTime: number | null };

const DAY = 86_400_000;
const MAX = 99_999_999;
const PROVIDERS = new Set(['busan','seoul','yesco','samchully','incheon','daeryun','kiturami','koone','cheongju','gumi','pohang','jeonnam','gangwon','jeonbuk','jb','jeonbukgas','gunsan','jeju','kyungdong','cncity','daesung','daesungclean','knenergy','seorabeol','gse','haeyang','chambit','mcenergy','seohae','daehwa','myungsung','other']);
const fail = (message: string): never => { throw new Error(message); };
const object = (value: unknown, message = '백업 형식을 확인해 주세요.'): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(message);
const array = (value: unknown, message = '백업 형식을 확인해 주세요.'): unknown[] => Array.isArray(value) ? value : fail(message);
const string = (value: unknown, message = '문자열 형식을 확인해 주세요.'): string => typeof value === 'string' ? value : fail(message);
const bool = (value: unknown, fallback = false): boolean => value === undefined ? fallback : typeof value === 'boolean' ? value : fail('논리값 형식을 확인해 주세요.');
const integer = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = value === undefined ? fallback : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : fail('숫자 범위를 확인해 주세요.');
};
const finite = (value: unknown, nullable = false): number | null => {
  if (value === null || value === undefined) return nullable ? null : fail('숫자 형식을 확인해 주세요.');
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX ? value : fail('숫자 범위를 확인해 주세요.');
};
const limited = (value: unknown, max: number, fallback = ''): string => string(value === undefined ? fallback : value).slice(0, max);
const bounded = (value: unknown, max: number, message: string, min = 1): string => {
  const result = string(value, message);
  return result.length >= min && result.length <= max ? result : fail(message);
};

function dateParts(value: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fail('날짜 형식을 확인해 주세요.');
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) fail('날짜를 확인해 주세요.');
  return [year, month, day];
}
function iso(value: unknown): string { const raw = string(value); dateParts(raw); return raw; }
function optionalDate(value: unknown): string | null { return value === null || value === undefined ? null : iso(value); }
function month(value: unknown, direct = false): string {
  const raw = string(value);
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return fail('청구 월 형식을 확인해 주세요.');
  const year = Number(match[1]); const mon = Number(match[2]);
  if (mon < 1 || mon > 12 || (direct && (year < 2000 || year > 2100))) fail('청구 월을 확인해 주세요.');
  return raw;
}
function compactMonth(value: unknown, strict2000 = false): string {
  const raw = string(value);
  if (!/^(?:20\d{2})(?:0[1-9]|1[0-2])$/.test(raw) || (strict2000 && Number(raw.slice(0, 4)) < 2000)) fail('청구 월 형식을 확인해 주세요.');
  return raw;
}
function dayIndex(date: string): number { const [y,m,d] = dateParts(date); return Math.floor(Date.UTC(y,m - 1,d) / DAY); }
function dateFromDay(day: number): string { const x = new Date(day * DAY); return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(x.getUTCDate()).padStart(2,'0')}`; }
function addMonths(date: string, delta: number): string { const [y,m,d] = dateParts(date); const x = new Date(Date.UTC(y, m - 1 + delta, 1)); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); return dateFromDay(Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), Math.min(d,last)) / DAY)); }

/** Korea-time calendar date, matching Android's `Instant.atZone(Asia/Seoul)`. */
export function dateOf(ms: number): string { if (!Number.isFinite(ms)) return fail('시각을 확인해 주세요.'); return dateFromDay(Math.floor((ms + 9 * 3_600_000) / DAY)); }
/** Midnight in Korea for an ISO date. */
export function dayStart(date: string): number { const [y,m,d] = dateParts(date); return Date.UTC(y,m - 1,d) - 9 * 3_600_000; }

export function createEmptyData(): AppData {
  return { profile: { providerId: 'busan', meter: 'manual', contract: '', plannedDate: null, syncTime: null, reminder: false, reminderDay: 7, reminderHour: 19, reminderRepeatCount: 3, customerNumber: '', reconnectRequired: false }, periods: [], observations: [], submissionSettings: { enabled: false, automatic: false, requireRecentCheck: true, recentDays: 7, reminder: false, reminderHour: 9, reminderMinute: 0 }, submissions: [], ready: false, gasappBills: [], samchullyBills: [], energyTalkBills: [], directBills: [] };
}

export function validatePeriods(periods: UsagePeriod[], now = Date.now()): void {
  if (periods.length > 600) fail('사용 이력은 600개까지 가져올 수 있어요.');
  const today = dateOf(now);
  for (const p of periods) {
    const first = dayIndex(p.start); const last = dayIndex(p.end);
    if (last - first + 1 < 1 || last - first + 1 > 370 || Number(p.start.slice(0,4)) < 2000 || p.end > today) fail('사용 기간을 확인해 주세요. 미래 기간은 입력할 수 없어요.');
    if (!Number.isFinite(p.usage) || p.usage < 0 || p.usage > 9_999_999) fail('사용량을 확인해 주세요.');
    for (const n of [p.previous,p.current,p.amount,p.unitCost,p.baseCost]) if (n !== null && (!Number.isFinite(n) || n < 0 || n > MAX)) fail('숫자 범위를 확인해 주세요.');
    if (p.previous !== null && p.current !== null && (p.current < p.previous || Math.abs(p.current - p.previous - p.usage) >= .011)) fail('지침과 사용량이 일치하지 않아요.');
  }
  const sorted = [...periods].sort((a,b) => a.start.localeCompare(b.start));
  for (let i=1;i<sorted.length;i++) if (sorted[i-1].end >= sorted[i].start) fail('사용 기간이 겹쳐요. 기존 이력의 날짜를 확인해 주세요.');
}

function decodePeriod(value: unknown): UsagePeriod { const r=object(value); return { start: iso(r.start), end: iso(r.end), usage: finite(r.usage)!, meter: limited(r.meter,100,'manual'), previous: finite(r.previous,true), current: finite(r.current,true), billMonth: limited(r.billMonth,100,''), amount: finite(r.amount,true), unitCost: finite(r.unitCost,true), baseCost: finite(r.baseCost,true) }; }
function decodeObservation(value: unknown, now: number): Observation { const r=object(value); const time=r.time; if(typeof time!=='number'||!Number.isInteger(time)||time<dayStart('2000-01-01')||time>now) fail('확인 기록 시각을 확인해 주세요.'); const meter=bounded(r.meter,100,'계량기를 확인해 주세요.'); return {time:time as number,reading:finite(r.reading)!,meter,predicted:finite(r.predicted,true)}; }
function decodeGasapp(value: unknown): GasappBill { const r=object(value); return {month:month(r.month),usage:finite(r.usage,true),amount:finite(r.amount,true),start:optionalDate(r.start),end:optionalDate(r.end)}; }
function decodeSamchully(value: unknown): SamchullyBill { const r=object(value); const start=optionalDate(r.start),end=optionalDate(r.end); if(start&&end&&start>end) fail('사용 기간을 확인해 주세요.'); const meter=r.meter===null||r.meter===undefined?null:string(r.meter); if(meter!==null&&!/^[0-9a-f]{16,64}$/.test(meter)) fail('계량기 형식을 확인해 주세요.'); return {month:compactMonth(r.month),start,end,previous:finite(r.previous,true),current:finite(r.current,true),usage:finite(r.usage,true),amount:finite(r.amount,true),meter}; }
function decodeEnergy(value: unknown): EnergyTalkBill { const r=object(value); const mon=compactMonth(r.month); const usage=bounded(r.usage,200,'EnergyTalk 청구 정보를 확인해 주세요.'),amount=bounded(r.amount,200,'EnergyTalk 청구 정보를 확인해 주세요.'); const unit=r.unit===null||r.unit===undefined?null:bounded(r.unit,50,'EnergyTalk 사용량 단위를 확인해 주세요.'); return {month:mon,usage,amount,unit}; }
function decodeDirect(value: unknown): DirectBill { const r=object(value); const start=optionalDate(r.start),end=optionalDate(r.end),previous=finite(r.previous,true),current=finite(r.current,true); if(start&&end&&start>end) fail('사용 기간을 확인해 주세요.'); if(previous!==null&&current!==null&&current<previous) fail('지침을 확인해 주세요.'); const meterId=r.meterId===null||r.meterId===undefined?null:bounded(r.meterId,100,'계량기 형식을 확인해 주세요.'); return {month:month(r.month,true),usage:finite(r.usage,true),amount:finite(r.amount,true),start,end,previous,current,meterId}; }

export function decodeBackup(raw: string, now = Date.now()): AppData {
  if (raw.length > 2_000_000) fail('파일이 너무 커요. 2MB 이하의 백업 파일을 선택해 주세요.');
  let root: Record<string,unknown>; try { root=object(JSON.parse(raw)); } catch { return fail('백업 JSON 형식을 확인해 주세요.'); }
  const schema=root.schema; if(typeof schema!=='number'||!Number.isInteger(schema)||schema<1||schema>4) fail('지원하지 않는 백업 형식이에요.');
  const p=object(root.profile); const provider=string(p.providerId); if(!PROVIDERS.has(provider)) fail('지원하지 않는 공급사 정보예요.');
  const meter=bounded(p.meter,100,'계량기를 확인해 주세요.');
  const profile: Profile={providerId:provider,meter,contract:limited(p.contract,100,''),plannedDate:optionalDate(p.plannedDate),syncTime:p.syncTime===null||p.syncTime===undefined?null:(typeof p.syncTime==='number'&&Number.isInteger(p.syncTime)?p.syncTime:fail('동기화 시각을 확인해 주세요.')),reminder:false,reminderDay:integer(p.reminderDay,7,1,7),reminderHour:integer(p.reminderHour,19,0,23),reminderRepeatCount:integer(p.reminderRepeatCount,3,0,6),customerNumber:limited(p.customerNumber,100,''),reconnectRequired:false};
  const periods=array(root.periods); const observations=array(root.observations); if(observations.length>10_000) fail('확인 기록이 너무 많아요.');
  const rawSettings = root.submissionSettings === undefined ? undefined : object(root.submissionSettings);
  const submissionSettings: SubmissionSettings = rawSettings === undefined ? createEmptyData().submissionSettings : {
    enabled: bool(rawSettings.enabled), automatic: false, requireRecentCheck: bool(rawSettings.requireRecentCheck, true), recentDays: integer(rawSettings.recentDays,7,1,40),
    reminder: false, reminderHour: integer(rawSettings.reminderHour,9,0,23), reminderMinute: integer(rawSettings.reminderMinute,0,0,59),
  };
  const data: AppData={...createEmptyData(), profile, submissionSettings, periods:periods.map(decodePeriod), observations:observations.map(v=>decodeObservation(v,now)).sort((a,b)=>a.time-b.time), ready:bool(root.ready,true), gasappBills:(root.gasappBills===undefined?[]:array(root.gasappBills)).map(decodeGasapp), samchullyBills:(root.samchullyBills===undefined?[]:array(root.samchullyBills)).map(decodeSamchully), energyTalkBills:(root.energyTalkBills===undefined?[]:array(root.energyTalkBills)).map(decodeEnergy), directBills:(root.directBills===undefined?[]:array(root.directBills)).map(decodeDirect)};
  validatePeriods(data.periods,now);
  const byMeter = new Map<string, Observation[]>();
  for (const observation of data.observations) byMeter.set(observation.meter, [...(byMeter.get(observation.meter) ?? []), observation]);
  for(const group of byMeter.values()) for(let i=1;i<group.length;i++) if(group[i].time<=group[i-1].time||group[i].reading<group[i-1].reading) fail('확인 기록의 순서나 지침을 확인해 주세요.');
  if(data.gasappBills.length>600||data.samchullyBills.length>120||data.energyTalkBills.length>120||data.directBills.length>600) fail('청구 이력이 너무 많아요.');
  if(new Set(data.samchullyBills.map(b=>b.month)).size!==data.samchullyBills.length||new Set(data.energyTalkBills.map(b=>b.month)).size!==data.energyTalkBills.length) fail('청구 월이 중복됐어요.');
  const rows=root.submissions===undefined?[]:array(root.submissions); if(rows.length>100) fail('제출 기록이 너무 많아요.');
  data.submissions=rows.map(value=>{const r=object(value); const status=string(r.status); if(!['pending','confirmed','uncertain','rejected'].includes(status)) fail('제출 상태를 확인해 주세요.'); const source=r.confirmationSource===undefined||r.confirmationSource===null?null:string(r.confirmationSource); if(source!==null&&source!=='provider_response'&&source!=='readback') fail('확인 근거를 확인해 주세요.'); const attempted=r.attemptedAt; if(typeof attempted!=='number'||!Number.isInteger(attempted)) fail('제출 시각을 확인해 주세요.'); return {cycle:bounded(r.cycle,80,'제출 기록을 확인해 주세요.'),periodStart:iso(r.periodStart),periodEnd:iso(r.periodEnd),value:finite(r.value)!,attemptedAt:attempted as number,status:status as SubmissionRecord['status'],detail:limited(r.detail,300,''),confirmationSource:source as SubmissionRecord['confirmationSource']};});
  return data;
}

/** Public export always strips authentication, cached targets, and all automatic actions. */
export function encodeBackup(input: AppData): string {
  const data=decodeBackup(JSON.stringify({schema:4,...input}));
  const profile={providerId:data.profile.providerId,meter:data.profile.meter,contract:data.profile.contract,plannedDate:data.profile.plannedDate,syncTime:data.profile.syncTime,reminder:false,reminderDay:data.profile.reminderDay,reminderHour:data.profile.reminderHour,reminderRepeatCount:data.profile.reminderRepeatCount,customerNumber:data.profile.customerNumber};
  const settings={enabled:data.submissionSettings.enabled,automatic:false,requireRecentCheck:data.submissionSettings.requireRecentCheck,recentDays:data.submissionSettings.recentDays,reminder:false,reminderHour:data.submissionSettings.reminderHour,reminderMinute:data.submissionSettings.reminderMinute};
  const submissions=data.submissions.map(({ confirmationSource, ...record }) => confirmationSource === null ? record : { ...record, confirmationSource });
  return JSON.stringify({schema:4,ready:data.ready,profile,periods:data.periods,observations:data.observations,gasappBills:data.gasappBills,samchullyBills:data.samchullyBills,energyTalkBills:data.energyTalkBills,directBills:data.directBills,submissionSettings:settings,submissions},null,2);
}

type Anchor={time:number;reading:number};
function anchors(data:AppData,until:number):Anchor[]{return [...data.observations.filter(o=>o.meter===data.profile.meter&&o.time<=until).map(o=>({time:o.time,reading:o.reading})),...data.periods.filter(p=>p.meter===data.profile.meter&&p.current!==null).map(p=>({time:dayStart(addMonths(p.end,0))+DAY,reading:p.current!})).filter(a=>a.time<=until)].filter((a,i,all)=>all.findIndex(b=>b.time===a.time)===i).sort((a,b)=>a.time-b.time);}
function monthlyRate(periods:UsagePeriod[], year:number, mon:number):number|null { let sum=0,covered=0; const first=`${year}-${String(mon).padStart(2,'0')}-01`; const last=dateFromDay(Math.floor(Date.UTC(year,mon,0)/DAY)); for(const p of periods){const start=p.start>first?p.start:first,end=p.end<last?p.end:last;if(start<=end){const days=dayIndex(end)-dayIndex(start)+1;covered+=days;sum+=p.usage/(dayIndex(p.end)-dayIndex(p.start)+1)*days;}} const length=dayIndex(last)-dayIndex(first)+1; return covered>=Math.min(14,length)?sum/covered:null; }
function seasonal(data:AppData,date:string,cache:Map<string,number|null>):number|null {
  const [year,monthOfYear,day] = dateParts(date);
  // LocalDate.minusYears converts 29 February to 28 February in a non-leap year.
  const priorYear = year - 1;
  const priorMonthLast = new Date(Date.UTC(priorYear, monthOfYear, 0)).getUTCDate();
  const priorDay = Math.min(day, priorMonthLast);
  const key=(yy:number,mm:number)=>`${yy}-${mm}`;
  const rate=(yy:number,mm:number)=>{const k=key(yy,mm);if(!cache.has(k))cache.set(k,monthlyRate(data.periods,yy,mm));return cache.get(k)!;};
  const main=rate(priorYear,monthOfYear); if(main===null)return null;
  const neighbor=priorDay<15?monthOfYear-1:monthOfYear+1;
  const neighborYear=neighbor===0?priorYear-1:neighbor===13?priorYear+1:priorYear;
  const neighborMonth=neighbor===0?12:neighbor===13?1:neighbor;
  const other=rate(neighborYear,neighborMonth); if(other===null)return main;
  const center=dayIndex(`${priorYear}-${String(monthOfYear).padStart(2,'0')}-15`);
  const adjacent=dayIndex(`${neighborYear}-${String(neighborMonth).padStart(2,'0')}-15`);
  const target=dayIndex(`${priorYear}-${String(monthOfYear).padStart(2,'0')}-${String(priorDay).padStart(2,'0')}`);
  const weight=Math.abs(target-center)/Math.abs(adjacent-center);
  return main*(1-weight)+other*weight;
}
function robust(points:Observation[]):number|null { const slopes:number[]=[];for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const days=(points[j].time-points[i].time)/DAY;if(days>0)slopes.push((points[j].reading-points[i].reading)/days);}if(!slopes.length)return null;slopes.sort((a,b)=>a-b);const n=slopes.length,m=Math.floor(n/2);return Math.max(0,n%2?slopes[m]:(slopes[m-1]+slopes[m])/2);}
function integrate(start:number,end:number,rate:(date:string)=>number|null):number|null {if(end<start||end-start>370*DAY)return null;let total=0,cursor=start;while(cursor<end){const date=dateOf(cursor),next=Math.min(end,dayStart(date)+DAY),daily=rate(date);if(daily===null)return null;total+=daily*(next-cursor)/DAY;cursor=next;}return total;}
function bias(data:AppData,until:number):number|null {const obs=data.observations.filter(o=>o.meter===data.profile.meter&&o.time<=until).sort((a,b)=>a.time-b.time);let sum=0,total=0,weight=1,samples=0;for(let i=obs.length-1;i>=0&&samples<12;i--){const p=obs[i].predicted;if(p===null)continue;const base=anchors({...data,observations:obs.slice(0,i)},obs[i].time).at(-1);if(!base)continue;const forecast=p-base.reading,actual=obs[i].reading-base.reading;if(forecast<.5||actual<.5)continue;sum+=weight*Math.log(actual/forecast);total+=weight;weight*=.7;samples++;}return total>0?Math.min(2,Math.max(.5,Math.exp(sum/total))):null;}
export function estimate(data:AppData,time=Date.now(),evidenceUntil=time):Estimate {const anchor=anchors(data,Math.min(time,evidenceUntil)).at(-1);if(!anchor)return {reading:null,daily:null,source:'첫 계량기 확인이 필요해요',ageDays:null,anchorTime:null};const age=Math.max(0,Math.floor((time-anchor.time)/DAY));if(age>60)return {reading:null,daily:null,source:'확인한 지 60일이 지났어요',ageDays:age,anchorTime:anchor.time};const cache=new Map<string,number|null>(),seasonalAt=(d:string)=>seasonal(data,d,cache);const physical=data.observations.filter(o=>o.meter===data.profile.meter&&o.time<=evidenceUntil&&o.time<=time).sort((a,b)=>a.time-b.time);const last=physical.at(-1);const window=last?[...physical.filter(o=>o.time<=last.time-DAY&&o.time>=last.time-28*DAY),last]:[];const first=window.length>=2?window[0]:undefined,span=first&&last?(last.time-first.time)/DAY:0,recent=robust(window),evidence=span/(span+7),daysSince=last?(time-last.time)/DAY:Infinity,prior=first&&last?integrate(first.time,last.time,seasonalAt):null,ratio=prior!==null&&prior>.01&&recent!==null?Math.min(5,Math.max(0,recent*span/prior)):null,learned=ratio===null?bias(data,Math.min(time,evidenceUntil)):null,label=evidence*Math.max(0,Math.min(1,1-daysSince/28));const rate=(d:string)=>{const s=seasonalAt(d);const dateAge=last?Math.max(0,(dayStart(d)-last.time)/DAY):Infinity;if(s!==null){if(ratio!==null)return s*(1+evidence*Math.max(0,Math.min(1,1-dateAge/28))*(ratio-1));const corrected=s*(learned??1),blend=evidence*Math.max(0,Math.min(1,1-dateAge/14));return recent!==null&&blend>0?corrected*(1-blend)+recent*blend:corrected;}return recent!==null&&daysSince<=14?recent:null;};const increment=integrate(anchor.time,time,rate),daily=rate(dateOf(time)),source=increment===null?'작년 이력 또는 두 번의 실측이 필요해요':daily===null?'확인한 계량기 숫자':seasonalAt(dateOf(time))===null?'최근 실측 기준 · 계절 정보 없음':recent!==null&&label>0?'작년 계절 흐름 + 최근 실측 보정':learned!==null?'작년 계절 흐름 + 지난 확인 보정':'작년 계절 흐름 기준';return {reading:increment===null?null:anchor.reading+increment,daily,source,ageDays:age,anchorTime:anchor.time};}
export function addObservation(data:AppData,reading:number,time=Date.now()):AppData {
  if(!Number.isFinite(reading)||reading<0||reading>MAX) fail('숫자 범위를 확인해 주세요.');
  // Match Android's correction rule. A last row for a different meter is never reused as forecast evidence.
  const previous=data.observations.at(-1)?.meter===data.profile.meter && time-data.observations.at(-1)!.time>=0 && time-data.observations.at(-1)!.time<=600_000
    ? data.observations.at(-1) : undefined;
  const kept=previous ? data.observations.slice(0,-1) : data.observations;
  const anchor=anchors({...data,observations:kept},time).at(-1);
  if(anchor&&reading<anchor.reading) fail('이전 확인값보다 작아요. 계량기를 교체했다면 설정에서 새 계량기로 시작해 주세요.');
  const prior=estimate(data,time).reading;
  return {...data,observations:[...kept,{time,reading,meter:data.profile.meter,predicted:previous?.predicted??prior}]};
}
