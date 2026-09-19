from pathlib import Path
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
LANDING = ROOT / "ttokttok" / "index.html"


def test_landing_keeps_android_install_visible_and_links_to_the_local_web_app():
    html = LANDING.read_text(encoding="utf-8")

    assert 'href="https://play.google.com/apps/testing/dev.mahlernim.gasselfmeter"' in html
    assert 'href="https://groups.google.com/g/gas-self-meter-ai"' in html
    assert html.count('href="app/"') >= 3
    mobile = BeautifulSoup(html, "html.parser").select_one(".sticky-cta")
    assert mobile.select_one('a[href="#start"]').get_text() == "Android 앱 · 권장"
    assert mobile.select_one('a[href="app/"]').get_text() == "웹에서 시작하기"
    assert 'class="nav-cta" href="#start">Android 앱 · 권장' in html


def test_landing_uses_only_the_privacy_safe_record_marker_for_web_cta_copy():
    html = LANDING.read_text(encoding="utf-8")
    script = (ROOT / "ttokttok" / "landing.js").read_text(encoding="utf-8")

    assert 'data-web-cta' in html
    assert "ttokttok.hasRecords" in script
    assert "getItem(hasRecordsKey) === '1'" in script
    assert 'fetch(' not in script
    assert 'XMLHttpRequest' not in script


def test_landing_separates_android_supplier_actions_from_browser_local_records():
    html = LANDING.read_text(encoding="utf-8")

    assert '공급사 연결, 청구 이력 조회와 검침 제출은 Android 앱에서 이용합니다.' in html
    assert '웹에서 공급사 로그인, 청구 이력 조회, 검침 제출은 하지 않으며' in html
    assert '로컬 백업 파일로 내보내거나 복원합니다.' in html
