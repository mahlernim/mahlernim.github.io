import './style.css'
import { addObservation, createEmptyData, dateOf, dayStart, decodeBackup, encodeBackup, estimate, validatePeriods } from './domain'
import { getProvider, providers } from './providers'
import { ConflictError, loadState, recoverData, requestPersistence, saveData, savePreferences, watchChanges } from './storage'
import { decodePortableBackup, encodePortableBackup } from './backup'
import { calendarSubscriptionUrl, calendarUrl } from './calendar'
import { registerOffline } from './offline'
import { mergeChanges } from './merge'
import type { AppData } from './domain'

type Tab = 'today' | 'history' | 'providers' | 'settings'
type State = Awaited<ReturnType<typeof loadState>>
const app = document.querySelector<HTMLElement>('#app')!
let stored: State
let tab: Tab = 'today'
let demo = false
let pendingImport: any = null
let dirtyDraft: any = null
let draftBase: AppData | null = null
let unsavedInput = false
let updateApply: (() => void) | null = null
let notice = ''

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const n = (value: unknown) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const fmt = (value: unknown) => { if (!value) return '날짜 없음'; return (typeof value === 'string' ? value : dateOf(Number(value))).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1년 $2월 $3일') }
const now = () => Date.now()
const data = () => stored.data as any
const profile = () => data().profile || {}
const observations = () => [...(data().observations || [])].sort((a: any, b: any) => Number(b.time || b.at || 0) - Number(a.time || a.at || 0))
const currentObservations = () => observations().filter(row => row.meter === profile().meter)
const periods = () => [...(data().periods || [])].sort((a: any, b: any) => String(b.end || '').localeCompare(String(a.end || '')))
const bills = () => [...(data().gasappBills || []), ...(data().samchullyBills || []), ...(data().energyTalkBills || []), ...(data().directBills || [])]
const hasSetup = () => Boolean(data().ready)

function button(label: string, action: string, cls = '') { return `<button class="${cls}" type="button" data-action="${action}">${label}</button>` }
function card(title: string, body: string, cls = '') { return `<section class="card ${cls}"><h2>${title}</h2>${body}</section>` }
function empty(message: string, action?: string) { return `<div class="empty"><p>${message}</p>${action ? button(action, 'show-reading', 'button') : ''}</div>` }
function meterEstimate() {
  const value = estimate(data(), now()) as any
  if (!value) return null
  return value
}
function renderTop() {
  return `<header class="app-header"><a class="brand" href="/ttokttok/" aria-label="똑똑 소개 페이지">똑똑 <small>로컬 기록</small></a><a class="android-link" href="/ttokttok/#start">Android 앱 · 권장</a></header>
  <p class="android-note">Android 기기가 있다면 앱 사용을 권장해요.</p><div id="banners">${renderBanners()}</div>`
}
function renderBanners() {
  return `${notice ? `<div class="notice" role="status">${esc(notice)}</div>` : ''}
  ${demo ? `<div class="demo-banner" role="status">예시 기록 · 내 기록과 별도로 사용합니다. ${button('내 기록으로 돌아가기', 'exit-demo', 'text-button')}</div>` : ''}
  ${dirtyDraft ? `<div class="draft" role="status">저장하지 못한 초안이 있어요. ${button('최신 기록 불러오기', 'reload-draft', 'text-button')}${button('초안 다시 저장', 'retry-draft', 'text-button')}${button('초안 내보내기', 'export-draft', 'text-button')}${button('초안 버리기', 'discard-draft', 'text-button danger')}</div>` : ''}
  ${updateApply ? `<div class="update" role="status">새 버전이 준비됐어요 ${button('새로 적용', 'apply-update', 'text-button')}</div>` : ''}`
}
function renderToday() {
  const e = meterEstimate()
  const latest = currentObservations()[0]
  const pr = getProvider(profile().providerId)
  if (!hasSetup()) return `<div class="hero"><p class="eyebrow">기록은 이 기기에만 남아요</p><h1>우리 집 계량기부터<br>가볍게 기록하세요.</h1><p>공급사와 오늘 숫자를 입력하면 사용 흐름을 바로 볼 수 있어요.</p><form class="form setup-form" data-form="setup"><label>도시가스 공급사<select name="providerId"><option value="">직접 기록만 사용할게요</option>${providers.map((p: any) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label>계량기 누적 숫자 m³<input required inputmode="decimal" name="reading" placeholder="예: 1258.4"></label><label>계량기 번호 <span>선택</span><input name="meter" autocomplete="off"></label><p class="form-error" role="alert"></p><button class="button" type="submit">첫 기록 저장</button></form></div>`
  const hasEstimate = Boolean(e && e.reading !== null && e.daily !== null)
  return `<div class="page-title"><p class="eyebrow">${demo ? '예시 기록을 보고 있어요' : '오늘의 기록'}</p><h1>${hasEstimate ? `${n(e!.reading)} m³` : '추정에 기록이 더 필요해요'}</h1><p>${hasEstimate ? `${esc(e!.source || '최근 기록')} 기준 · 하루 약 ${n(e!.daily)} m³ · ${n(e!.ageDays)}일 전 기준점` : esc(e?.source || '계량기를 보고 누적 숫자를 저장하면 다음 사용량을 계산해요.')}</p></div>
  <div class="actions-row">${button('지침 기록', 'show-reading', 'button')}${button('청구 사용량 추가', 'show-period', 'soft-button')}</div>
  ${card('최근 계량기 기록', latest ? `<strong class="reading">${n(latest.reading)} m³</strong><p>${fmt(latest.time || latest.at)}에 저장</p>` : empty('아직 저장한 계량기 숫자가 없어요.', '지침 기록'))}
  ${pr && pr.id !== 'other' ? card('공식 공급사로 확인', `<p>${esc(pr.name)}의 공식 페이지에서 검침 대상과 제출 상태를 확인할 수 있어요. 이 웹앱은 공급사에 로그인하거나 제출하지 않습니다.</p><a class="external" rel="noopener noreferrer" target="_blank" href="${esc(pr.website)}">${esc(pr.name)} 공식 홈페이지에서 조회·제출</a>`) : ''}
  ${bills().length ? card('가져온 청구 요약', bills().slice(0, 3).map((b: any) => `<div class="line"><span>${esc(b.label || b.month || fmt(b.end))}</span><strong>${b.usage !== null && b.usage !== undefined ? `${esc(b.usage)} m³` : b.amount !== null && b.amount !== undefined ? `${n(b.amount)}원` : '확인 필요'}</strong></div>`).join('')) : ''}
  ${!demo && stored.revision !== stored.preferences.exportRevision && stored.preferences.backupSnoozedUntil < now() && (!stored.preferences.lastExportAt || now() - stored.preferences.lastExportAt >= 30 * 86400000) ? `<section class="backup-prompt"><strong>소중한 기록을 파일로 보관하세요.</strong><span>${button('JSON 내보내기', 'download-backup', 'text-button')}${button('한 달 뒤에', 'snooze-backup', 'text-button')}</span></section>` : ''}`
}
function renderHistory() {
  const list = observations()
  const ps = periods()
  const chart = currentObservations().slice(0, 12).reverse()
  const min = Math.min(...chart.map(x => x.reading)), max = Math.max(...chart.map(x => x.reading))
  const points = chart.map((x: any, i: number) => `${i * (280 / Math.max(1, chart.length - 1))},${104 - (x.reading - min) / Math.max(1, max - min) * 82}`).join(' ')
  return `<div class="page-title compact"><p class="eyebrow">우리 집 기록</p><h1>사용 흐름</h1><p>직접 입력한 숫자와 청구 기간을 수정하거나 삭제할 수 있어요.</p></div>
  ${card('현재 계량기 변화', chart.length > 1 ? `<svg class="chart" viewBox="0 0 280 116" role="img" aria-label="계량기 누적 지침 변화"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>` : empty('두 번 이상 기록하면 변화가 선으로 보여요.', '지침 기록'))}
  ${card('계량기 기록', list.length ? `<ul class="records">${list.map((x: any, i: number) => `<li><div><strong>${n(x.reading)} m³</strong><span>${fmt(x.time)} · ${esc(x.meter)}</span></div><div>${button('수정', `edit-reading:${i}`, 'text-button')}${button('삭제', `delete-reading:${i}`, 'text-button danger')}</div></li>`).join('')}</ul>` : empty('기록이 없습니다.'))}
  ${card('청구 사용 기간', `<div class="actions-row">${button('기간 추가', 'show-period', 'soft-button')}</div>${ps.length ? `<ul class="records">${ps.map((x: any, i: number) => `<li><div><strong>${n(x.usage)} m³</strong><span>${fmt(x.start || x.from)} ~ ${fmt(x.end || x.to)}</span></div><div>${button('수정', `edit-period:${i}`, 'text-button')}${button('삭제', `delete-period:${i}`, 'text-button danger')}</div></li>`).join('')}</ul>` : empty('청구서의 사용 기간과 사용량을 추가할 수 있어요.')}`)}
  ${card('계량기 교체', '<p>새 계량기 번호와 첫 숫자를 저장하면 이전 기록은 남기고 새 계량기부터 이어서 기록합니다.</p>' + button('교체 기록 시작', 'show-replace', 'soft-button'))}
  ${bills().length ? card('가져온 공급사 청구 이력', `<ul class="records">${bills().map(b => `<li><div><strong>${esc(b.month)}</strong><span>사용량 ${b.usage == null ? '정보 없음' : esc(b.usage)} ${esc(b.unit || 'm³')} · 요금 ${b.amount == null ? '정보 없음' : typeof b.amount === 'number' ? n(b.amount) + '원' : esc(b.amount)}</span></div></li>`).join('')}</ul>`) : ''}
  ${data().submissions.length ? card('가져온 제출 이력', `<p>Android에서 가져온 과거 기록입니다. 복원으로 새 제출을 보내지 않아요.</p><ul class="records">${data().submissions.map((s: any) => `<li><div><strong>${n(s.value)} m³ · ${esc(({pending:'확인 대기',confirmed:'확인 완료',uncertain:'결과 재확인 필요',rejected:'거절됨'} as Record<string,string>)[s.status])}</strong><span>${esc(s.periodStart)} ~ ${esc(s.periodEnd)}</span><span>${esc(s.detail)}</span></div></li>`).join('')}</ul>`) : ''}`
}
function renderProviders() {
  const pr = getProvider(profile().providerId)
  return `<div class="page-title compact"><p class="eyebrow">공식 페이지 안내</p><h1>공급사</h1><p>공급사 연결은 계속 넓어지고 있어요. 이 웹앱에서는 공식 사이트로만 이동합니다.</p></div>
  ${pr ? card('선택한 공급사', `<h3>${esc(pr.name)}</h3><p>${esc(pr.regions || '')}</p><a class="external" rel="noopener noreferrer" target="_blank" href="${esc(pr.website)}">공식 홈페이지에서 조회·제출</a>`) : ''}
  ${card('공급사 목록', `<div class="provider-list">${providers.map((p: any) => `<article><div><h3>${esc(p.name)}</h3><p>${esc(p.regions || '')}</p></div><div>${button('선택', `provider:${esc(p.id)}`, 'text-button')}<a class="external mini" rel="noopener noreferrer" target="_blank" href="${esc(p.website)}">공식 홈페이지</a></div></article>`).join('')}</div>`)}
  ${card('공식 사이트에 숫자 붙여넣기', `<p>현재 계량기 ${esc(profile().meter)} · 최근 숫자 ${currentObservations()[0] ? n(currentObservations()[0].reading) + ' m³' : '없음'}. 공식 사이트를 여는 것만으로 제출이 완료되지 않아요.</p><label class="check"><input id="copy-confirm" type="checkbox"> 제출할 값과 대상 계약을 공식 사이트에서 확인했습니다</label>${button('최근 숫자 복사', 'copy-reading', 'soft-button')}`)}`
}
function renderSettings() {
  const pref: any = stored.preferences
  const exportText = pref.lastExportAt ? new Date(pref.lastExportAt).toLocaleDateString('ko-KR') + '에 내보내기를 시작했어요' : '아직 내보낸 기록이 없어요'
  return `<div class="page-title compact"><p class="eyebrow">내 기록 관리</p><h1>설정</h1><p>로그인이나 서버 전송 없이 이 브라우저의 저장 공간만 사용합니다.</p></div>
  ${card('백업 파일', `<p>${exportText}. 저장 위치나 파일 보관 여부는 브라우저가 확인할 수 없어요.</p><p>백업은 읽을 수 있는 JSON 파일이며 고객번호 등 우리 집 정보가 포함될 수 있어요. 원하는 안전한 위치에 보관하세요.</p><p>Safari와 홈 화면 앱은 서로 다른 기록을 사용할 수 있어요. 기존 화면에서 내보낸 파일을 새 화면에서 가져오면 이동할 수 있습니다.</p><div class="actions-row">${button('JSON 내보내기', 'download-backup', 'button')}${button('파일 공유', 'share-backup', 'soft-button')}${button('JSON 가져오기', 'import', 'soft-button')}</div><input id="import-file" hidden type="file" accept="application/json,.json">`)}
  ${card('기기 저장', `<p>브라우저 데이터 삭제, 비공개 탐색 종료나 저장 공간 정리로 기록이 사라질 수 있어요. 아래 요청은 자동 정리 가능성을 줄이며 백업을 대신하지 않습니다. Android Keystore로 보호되는 저장 공간은 아닙니다.</p>${button('기록 보관 권한 요청', 'persist', 'soft-button')}${!demo ? button('예시 기록 보기', 'demo', 'text-button') : ''}`)}
  ${card('주간 알림 캘린더', `<p>선택한 한국 시간에 매주 반복하는 일반 일정이며 개인 기록은 포함하지 않습니다. 알림은 캘린더 앱의 설정과 권한에 따라 울려요.</p><form class="inline-form" data-form="calendar"><label>요일<select name="day">${['월','화','수','목','금','토','일'].map((x, i) => `<option value="${i + 1}" ${Number(pref.reminderDay) === i + 1 ? 'selected' : ''}>${x}요일</option>`).join('')}</select></label><label>시간<select name="hour">${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${Number(pref.reminderHour) === i ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('')}</select></label><button class="soft-button" type="submit">링크 만들기</button></form><div id="calendar-links"></div><p>파일을 내려받아 사용하는 캘린더의 가져오기 메뉴에서 열거나 구독 링크를 선택하세요. iPhone에서 파일이 열리지 않으면 Safari에서 구독 링크를 이용하세요. Google Calendar의 파일 가져오기는 컴퓨터에서 할 수 있어요. 시간을 바꿀 때는 이전 반복 일정을 먼저 삭제해 중복 알림을 피하세요.</p>`)}
  ${card('기록 초기화', `<p>가져오기 화면에서 새 파일로 교체할 수 있습니다. 현재 기록을 즉시 지우는 기능은 제공하지 않습니다.</p>`)}`
}
function renderDialog() {
  return `<dialog id="entry-dialog"><form method="dialog" class="dialog-card" id="entry-form"></form></dialog><dialog id="import-dialog"><div class="dialog-card" id="import-preview"></div></dialog>`
}
function render() {
  if (!stored) return
  const view = tab === 'today' ? renderToday() : tab === 'history' ? renderHistory() : tab === 'providers' ? renderProviders() : renderSettings()
  app.innerHTML = `${renderTop()}<main id="main">${view}</main><nav class="tabs" aria-label="앱 메뉴">${([['today','오늘'],['history','기록'],['providers','공급사'],['settings','설정']] as [Tab,string][]).map(([id, label]) => `<button class="${tab === id ? 'active' : ''}" type="button" data-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}">${label}</button>`).join('')}</nav>${renderDialog()}`
  wire()
}
function status(message: string) { flash(message) }
function clone(value: any) { return JSON.parse(JSON.stringify(value)) }
function refreshBanners() {
  const target = app.querySelector('#banners')
  if (!target) return
  app.querySelectorAll('.dialog-feedback').forEach(el => el.remove())
  target.innerHTML = renderBanners()
  const dialog = app.querySelector('dialog[open] .dialog-card')
  if (dialog) {
    const feedback = document.createElement('div'); feedback.className = 'dialog-feedback'
    target.querySelectorAll('.notice,.draft').forEach(el => feedback.append(el))
    dialog.append(feedback)
  }
}
function flash(message: string) { notice = message; refreshBanners() }
function clearDraft() { dirtyDraft = null; draftBase = null; unsavedInput = false }
function canLeave() {
  if (!(unsavedInput || dirtyDraft)) return true
  if (!confirm('저장하지 않은 입력을 버리고 이동할까요?')) return false
  clearDraft(); return true
}
async function persist(next: any): Promise<boolean> {
  try { next = decodeBackup(encodeBackup(next)) } catch (error) { flash(error instanceof Error ? error.message : '입력값을 확인해 주세요.'); return false }
  if (demo) { stored.data = next; clearDraft(); render(); return true }
  draftBase ??= clone(stored.data)
  dirtyDraft = next
  try { stored = await saveData(next, stored.revision); clearDraft(); notice = '기기에 저장됨'; render(); return true }
  catch (error) { flash(error instanceof ConflictError ? '다른 화면에서 기록이 바뀌었어요. 초안을 유지했습니다.' : '저장하지 못했습니다. 초안을 유지했습니다.'); return false }
}
function openEntry(kind: 'reading' | 'period' | 'replace', index = -1) {
  const dialog = document.querySelector<HTMLDialogElement>('#entry-dialog')!
  const form = dialog.querySelector<HTMLFormElement>('#entry-form')!
  const item = kind === 'reading' ? observations()[index] : periods()[index]
  const today = dateOf(now())
  form.innerHTML = kind === 'period' ? `<h2>청구 사용량</h2><p>청구서에 적힌 기간과 사용량을 입력하세요.</p><input type="hidden" name="kind" value="period"><input type="hidden" name="index" value="${index}"><label>시작일<input required name="start" type="date" value="${item ? esc(item.start || item.from) : today}"></label><label>종료일<input required name="end" type="date" value="${item ? esc(item.end || item.to) : today}"></label><label>사용량 m³<input required inputmode="decimal" name="usage" value="${item ? esc(item.usage) : ''}"></label><p class="form-error" role="alert"></p><div class="actions-row"><button class="button" type="submit">저장</button>${button('닫기', 'close-dialog', 'text-button')}</div>` : `<h2>${kind === 'replace' ? '계량기 교체' : '계량기 숫자'}</h2><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="index" value="${index}"><label>날짜<input required name="date" type="date" value="${item ? dateOf(item.time || item.at) : today}"></label>${kind === 'replace' ? '<label>새 계량기 번호<input required name="meter"></label>' : ''}<label>누적 숫자 m³<input required inputmode="decimal" name="reading" value="${item ? esc(item.reading) : ''}"></label><p class="form-error" role="alert"></p><div class="actions-row"><button class="button" type="submit">저장</button>${button('닫기', 'close-dialog', 'text-button')}</div>`
  unsavedInput = false; notice = ''; refreshBanners()
  dialog.showModal(); form.querySelector<HTMLInputElement>('input:not([type=hidden])')?.focus()
}
function dialogError(form: HTMLFormElement, message: string) { (form.querySelector('.form-error') as HTMLElement).textContent = message }
async function submitEntry(form: HTMLFormElement) {
  const fd = new FormData(form), kind = String(fd.get('kind')), index = Number(fd.get('index'))
  let next = clone(data())
  if (kind === 'period') {
    const start = String(fd.get('start')), end = String(fd.get('end')), usage = Number(fd.get('usage'))
    if (!Number.isFinite(usage) || usage < 0 || end < start) return dialogError(form, '기간과 사용량을 다시 확인해 주세요.')
    const selectedPeriod = index >= 0 ? periods()[index] : null
    const record = { previous: null, current: null, billMonth: '', amount: null, unitCost: null, baseCost: null, ...selectedPeriod, start, end, usage, meter: selectedPeriod?.meter || profile().meter || 'manual' }
    if (selectedPeriod && selectedPeriod.usage !== usage) { record.previous = null; record.current = null }
    if (index >= 0) { const selected = periods()[index]; const at = next.periods.findIndex((x: any) => JSON.stringify(x) === JSON.stringify(selected)); if (at >= 0) next.periods.splice(at, 1, record) } else next.periods = [...(next.periods || []), record]
    try { validatePeriods(next.periods, now()) } catch (error) { return dialogError(form, error instanceof Error ? error.message : '청구 기간이 겹치지 않는지 확인해 주세요.') }
  } else {
    const reading = Number(fd.get('reading')), date = String(fd.get('date'))
    const selected = index >= 0 ? observations()[index] : null
    const time = selected && date === dateOf(selected.time) ? selected.time : date === dateOf(now()) ? now() : dayStart(date)
    if (!Number.isFinite(reading) || reading < 0) return dialogError(form, '0 이상인 계량기 숫자를 입력해 주세요.')
    if (kind === 'replace') {
      const meter = String(fd.get('meter')).trim()
      if (!meter || meter === profile().meter || observations().some(row => row.meter === meter)) return dialogError(form, '이전에 사용하지 않은 새 계량기 번호를 입력해 주세요.')
      next.profile = { ...next.profile, meter, reconnectRequired: false }
    }
    if (selected) { const at = next.observations.findIndex((x: any) => JSON.stringify(x) === JSON.stringify(selected)); if (at >= 0) next.observations.splice(at, 1) }
    next = selected && selected.meter !== next.profile.meter ? { ...next, observations: [...next.observations, { ...selected, reading, time }] } : addObservation(next, reading, time)
  }
  if (await persist(next)) document.querySelector<HTMLDialogElement>('#entry-dialog')?.close()
}
function download(filename: string, text: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500) }
async function exportData(share = false, draft = false) {
  const revision = stored.revision
  const text = encodePortableBackup(draft ? dirtyDraft : data(), stored.preferences)
  const file = new File([text], `ttokttok-${demo ? 'demo' : draft ? 'draft' : 'backup'}-${dateOf(now())}.json`, { type: 'application/json' })
  try {
    if (share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: '똑똑 로컬 기록 백업', files: [file] })
    else download(file.name, text)
  } catch { flash('내보내기를 취소했거나 시작하지 못했습니다. JSON 내보내기로 파일을 내려받을 수 있어요.'); return }
  if (!demo && !draft) {
    try {
      const latest = await savePreferences({ lastExportAt: now(), exportRevision: revision })
      // Keep the user's screen snapshot while they are editing.
      stored.preferences = latest.preferences
    } catch { flash('파일 내보내기를 시작했지만 내보낸 시각을 기기에 저장하지 못했어요.'); return }
  }
  flash('백업 내보내기를 시작했어요. 선택한 위치에서 파일을 확인해 주세요.')
}
function wire() {
  app.onclick = async event => {
    const el = (event.target as Element).closest<HTMLElement>('[data-action],[data-tab]')
    if (!el) return
    if (el.dataset.tab) { if (canLeave()) { tab = el.dataset.tab as Tab; render() }; return }
    try {
    const [action, arg] = (el.dataset.action || '').split(':')
    if (action === 'show-reading') openEntry('reading'); if (action === 'show-period') openEntry('period'); if (action === 'show-replace') openEntry('replace')
    if (action === 'close-dialog' && canLeave()) { pendingImport = null; document.querySelectorAll<HTMLDialogElement>('dialog').forEach(x => x.close()); refreshBanners() }
    if (action === 'edit-reading') openEntry('reading', Number(arg)); if (action === 'edit-period') openEntry('period', Number(arg))
    if (action === 'delete-reading' || action === 'delete-period') { const next = clone(data()); const source = action === 'delete-reading' ? observations() : periods(); const target = source[Number(arg)]; const key = action === 'delete-reading' ? 'observations' : 'periods'; next[key] = (next[key] || []).filter((x: any) => x !== target && JSON.stringify(x) !== JSON.stringify(target)); await persist(next) }
    if (action === 'provider') { const next = clone(data()); next.profile = { ...(next.profile || {}), providerId: arg }; await persist(next) }
    if (action === 'copy-reading') { const latest = currentObservations()[0]; if (!(document.querySelector('#copy-confirm') as HTMLInputElement)?.checked) return status('공식 사이트의 대상 계약과 값을 확인한 뒤 체크해 주세요.'); if (!latest) return status('복사할 최근 숫자가 없습니다.'); if (!navigator.clipboard) return flash('이 브라우저에서는 복사를 지원하지 않아요. 표시된 숫자를 직접 입력해 주세요.'); await navigator.clipboard.writeText(String(latest.reading)); status('계량기 숫자를 클립보드에 복사했어요.') }
    if (action === 'export' || action === 'download-backup') await exportData(); if (action === 'share-backup') await exportData(true); if (action === 'import') document.querySelector<HTMLInputElement>('#import-file')?.click()
    if (action === 'persist') { const result = await requestPersistence(); status(result === true ? '브라우저가 기록 보관 권한을 허용했어요. 별도 백업은 계속 필요해요.' : result === false ? '브라우저가 요청을 허용하지 않았어요. JSON 백업으로 기록을 보관해 주세요.' : '이 브라우저에서는 별도 저장 권한 요청을 지원하지 않아요.') }
    if (action === 'snooze-backup') { try { if (!demo) stored = await savePreferences({ backupSnoozedUntil: now() + 30 * 86400000 }); render() } catch { flash('백업 알림을 미루지 못했습니다.') } }
    if (action === 'demo') { const sample = createEmptyData() as any; sample.profile = { ...sample.profile, providerId: providers[0]?.id, meter: '예시 계량기' }; sample.ready = true; sample.observations = [{ reading: 1240, time: now() - 10 * 86400000, meter: '예시 계량기', predicted: null }, { reading: 1261.4, time: now() - 2 * 86400000, meter: '예시 계량기', predicted: null }]; sample.periods = [{ start: dateOf(now() - 40 * 86400000), end: dateOf(now() - 10 * 86400000), usage: 58, meter: '예시 계량기', previous: null, current: null, billMonth: '', amount: null, unitCost: null, baseCost: null }]; stored = { ...stored, data: sample }; demo = true; tab = 'today'; render() }
    if (action === 'exit-demo') { demo = false; stored = await loadState(); render() }
    if (action === 'reload-draft') { stored = await loadState(); unsavedInput = false; flash('최신 기록을 불러왔습니다. 저장 실패한 초안은 그대로 두었습니다.'); render() }
    if (action === 'retry-draft') {
      if (!dirtyDraft || !draftBase) return
      const latest = await loadState()
      const merged = mergeChanges(draftBase, dirtyDraft, latest.data)
      stored = latest; draftBase = clone(latest.data)
      await persist(merged)
    }
    if (action === 'export-draft' && dirtyDraft) await exportData(false, true)
    if (action === 'discard-draft') { const latest = await loadState(); clearDraft(); stored = latest; render() }
    if (action === 'confirm-import' && pendingImport) {
      if (demo) { stored.data = pendingImport.data; stored.preferences = { ...stored.preferences, ...pendingImport.preferences } }
      else stored = await saveData(pendingImport.data, stored.revision, pendingImport.preferences)
      pendingImport = null; clearDraft(); notice = demo ? '예시 공간에만 가져왔어요.' : '기기에 저장됨'; render()
    }
    if (action === 'apply-update' && updateApply) { if ((dirtyDraft || unsavedInput) && !confirm('저장되지 않은 입력을 버리고 새 버전을 적용할까요?')) return; updateApply() }
    } catch (error) { flash(error instanceof Error ? error.message : '완료하지 못했어요. 다시 시도해 주세요.') }
  }
  app.oninput = event => { if ((event.target as Element).closest('form') && !(event.target instanceof HTMLInputElement && event.target.type === 'file')) unsavedInput = true }
  app.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => dialog.oncancel = event => { if (!canLeave()) event.preventDefault(); else refreshBanners() })
  app.querySelectorAll<HTMLFormElement>('form[data-form]').forEach(form => form.onsubmit = async event => { event.preventDefault(); const fd = new FormData(form); if (form.dataset.form === 'setup') { const reading = Number(fd.get('reading')); if (!Number.isFinite(reading) || reading < 0) return dialogError(form, '0 이상인 숫자를 입력해 주세요.'); const next = clone(data()); next.profile = { ...(next.profile || {}), providerId: String(fd.get('providerId') || 'other'), meter: String(fd.get('meter') || 'manual').trim() || 'manual' }; next.ready = true; try { await persist(addObservation(next, reading, now())) } catch (error) { dialogError(form, error instanceof Error ? error.message : '기록을 저장하지 못했습니다.') } } else if (form.dataset.form === 'calendar') { const day = Number(fd.get('day')), hour = Number(fd.get('hour')); try { if (demo) stored.preferences = { ...stored.preferences, reminderDay: day, reminderHour: hour }; else { const saved = await savePreferences({ reminderDay: day, reminderHour: hour }); stored.preferences = saved.preferences } unsavedInput = false; const output = app.querySelector('#calendar-links')!; output.innerHTML = `<a class="external" href="${calendarUrl(day, hour)}" download="ttokttok-weekly.ics">캘린더 파일 내려받기</a><a class="external" href="${calendarSubscriptionUrl(day, hour)}">구독 링크</a>` } catch { flash('알림 설정을 저장하지 못했습니다.') } } })
  const entryForm = document.querySelector<HTMLFormElement>('#entry-form')!
  entryForm.onsubmit = event => { event.preventDefault(); void submitEntry(entryForm).catch(error => dialogError(entryForm, error instanceof Error ? error.message : '입력값을 확인해 주세요.')) }
  const importFile = app.querySelector<HTMLInputElement>('#import-file')
  if (importFile) importFile.onchange = async () => { const file = (importFile.files || [])[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) return status('2MB 이하의 JSON 백업 파일만 가져올 수 있어요.'); try { pendingImport = decodePortableBackup(await file.text(), now()); const d: any = pendingImport.data; const dates = [...d.observations.map((row: any) => dateOf(row.time)), ...d.periods.flatMap((row: any) => [row.start, row.end])].sort(); const billCount = d.gasappBills.length + d.samchullyBills.length + d.energyTalkBills.length + d.directBills.length; const preview = app.querySelector('#import-preview')!; preview.innerHTML = `<h2>백업 교체 확인</h2><p>계량기 ${n(d.observations?.length)}건, 청구 기간 ${n(d.periods?.length)}건, 제출 기록 ${n(d.submissions?.length)}건, 공급사 청구 ${n(billCount)}건을 가져옵니다.</p><p>기록 날짜 ${dates.length ? esc(dates[0]) + " ~ " + esc(dates.at(-1)) : "없음"}</p><p>현재 이 기기의 가구 전체를 교체합니다. 공급사 재연결이나 자동 제출은 켜지지 않습니다.</p><div class="actions-row">${button('교체하기', 'confirm-import', 'button')}${button('취소', 'close-dialog', 'text-button')}</div>`; document.querySelector<HTMLDialogElement>('#import-dialog')!.showModal() } catch { status('유효한 똑똑 JSON 백업 파일이 아닙니다.') } }
}
async function boot() {
  window.addEventListener('beforeunload', event => { if (unsavedInput || dirtyDraft) { event.preventDefault(); event.returnValue = '' } })
  watchChanges(async () => {
    if (!stored || demo) return
    if (dirtyDraft || unsavedInput || pendingImport) { flash('다른 탭에서 기록이 바뀌었어요. 현재 입력은 유지합니다.'); return }
    try { stored = await loadState(); render() } catch { flash('변경된 기록을 다시 읽지 못했습니다. 현재 화면의 기록을 유지합니다.') }
  })
  registerOffline(apply => { updateApply = apply; refreshBanners() })
  try { stored = await loadState() }
  catch {
    app.innerHTML = renderTop() + '<main class="recovery"><h1>저장된 기록을 읽지 못했어요.</h1><p>기록을 덮어쓰지 않았습니다. 보관한 JSON 백업 파일로만 복구할 수 있어요.</p><label>JSON 백업 파일<input id="recovery-file" type="file" accept="application/json,.json"></label><p class="form-error" role="alert"></p></main>'
    const input = app.querySelector<HTMLInputElement>('#recovery-file')!
    input.onchange = async () => { const file = input.files?.[0]; if (!file) return; const error = app.querySelector<HTMLElement>('.form-error')!; if (file.size > 2 * 1024 * 1024) { error.textContent = '2MB 이하의 JSON 백업 파일만 복구할 수 있어요.'; return } try { const recovered = decodePortableBackup(await file.text(), now()); if (!confirm(`계량기 ${recovered.data.observations.length}건과 청구 기간 ${recovered.data.periods.length}건으로 복구할까요?`)) return; stored = await recoverData(recovered.data, recovered.preferences); notice = '백업으로 복구하고 기기에 저장됨'; render() } catch { error.textContent = '유효한 똑똑 JSON 백업 파일이 아니거나 복구하지 못했습니다.' } }
    return
  }
  render()
}
void boot()
