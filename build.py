import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from scripts.content_model import THEMES, load_json
from scripts.fetch_pubmed import fetch_works
from scripts.fetch_youtube import fetch_videos


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
PIPELINE = ROOT / "_pipeline"
TEMPLATES = ROOT / "templates"
BASE_URL = "https://ahn-lab.org"

AUTHOR = {
    "name": "안상진 (Sangzin Ahn)",
    "title": "인제대학교 의과대학 약리학교실 부교수",
    "affiliations": [
        "Department of Pharmacology, Inje University College of Medicine, Busan, Korea",
        "Cardiovascular and Metabolic Diseases Medical Research Center, Inje University College of Medicine, Busan, Korea",
    ],
    "research_interests": [
        "의학교육에서 대형언어모델 활용 (LLMs in Medical Education)",
        "의학연구에서 대형언어모델 적용 (LLM Applications in Medical Research)",
    ],
    "education": [
        "2016.03-현재: 인제대학교 의과대학 약리학교실 교수",
        "2009.03-2016.02: 의학박사, 서울대학교 의과학과 약리학 전공",
        "2003.03-2009.02: 의학사, 서울대학교 의과대학",
    ],
    "announcement": "정말 죄송하게도 경남 일대를 제외한 지역은 이동 시간과 체력적인 부담, 지방 연자를 위한 배려가 부족한 강연료 규정 등의 이유로 현장강의를 고사하고 있습니다. 부디 너그러운 양해 부탁드립니다.",
    "scholar": "https://scholar.google.com/citations?hl=ko&user=Xe825ZgAAAAJ&view_op=list_works&sortby=pubdate",
    "orcid": "https://orcid.org/0000-0003-2749-0014",
    "youtube": "https://youtube.com/playlist?list=PL0TnWnPQhDj2-TOwiz_ZhY2Sdurimss2Q",
    "blog": "https://largelearningmodel.wordpress.com/",
}

PROJECTS = [
    {"name": "Google Timeline Visualizer", "url": "/google-timeline-visualizer/", "description": "Turns a Google Maps Timeline export into a travel animation while keeping the location file in the browser."},
    {"name": "PDF to NotebookLM", "url": "https://github.com/mahlernim/chrome-pdf-to-notebooklm", "description": "A Chrome extension for adding PDFs and web pages to NotebookLM and creating outputs."},
    {"name": "Memori", "url": "https://memori.co.kr/", "description": "A community for collecting mnemonics and memory cues for medicine and learning."},
    {"name": "Sakang", "url": "https://sakang.mahler83.net/", "description": "Small tools for text cleanup, clinical calculations, documents, and training records."},
    {"name": "EduKMA", "url": "https://edukma.mahler83.net/", "description": "A finder for affordable online continuing medical education courses in Korea."},
    {"name": "LargeLearningModel", "url": "https://largelearningmodel.wordpress.com/", "description": "Notes on language models, learning, education, and a personal archive dating to 2008."},
    {"name": "Arithmetic Puzzle", "url": "https://arithmeticpuzzle.mahler83.net/", "description": "A generator for 4 by 4 arithmetic puzzles using natural numbers and basic operations."},
    {"name": "Home Assistant NEIS School", "url": "https://github.com/mahlernim/ha-neis-school", "description": "Home Assistant integration for school meals, timetables, calendars, and attendance information."},
    {"name": "Korean Twitter Activity Archive", "url": "https://tka.mahler83.net/", "description": "An anonymized public-data archive of changes in activity among Korean Twitter accounts."},
    {"name": "Tweet Earthquake Alert Archive", "url": "https://jijin.mahler83.net/", "description": "An archive of a project that detected earthquakes through aggregate collective reactions."},
]


def environment():
    env = Environment(
        loader=FileSystemLoader(TEMPLATES),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["from_json"] = json.loads
    return env


def summary_for(content, key):
    record = content.get("items", {}).get(key, {})
    return record if record.get("status") == "ready" else record or {"status": "pending_source"}


def render(env, template_name, output, **context):
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        env.get_template(template_name).render(
            author=AUTHOR,
            themes=THEMES,
            base_url=BASE_URL,
            build_year=datetime.now(timezone.utc).year,
            **context,
        ),
        encoding="utf-8",
        newline="\n",
    )


def build_site(offline=False):
    if offline:
        publications = list(load_json(DATA / "publications_cache.json", {}).values())
        videos = list(load_json(DATA / "videos_cache.json", {}).values())
        videos.sort(key=lambda item: item.get("playlist_position", 999999))
    else:
        publications = fetch_works()
        videos = fetch_videos()
    publications.sort(key=lambda item: (item.get("year", 0), item.get("pmid", "")), reverse=True)
    content = load_json(PIPELINE / "generated_content.json", {"schema_version": 1, "items": {}})
    posts = list(load_json(PIPELINE / "posts.json", {"items": {}}).get("items", {}).values())
    posts = [post for post in posts if post.get("status") == "ready"]
    if len(posts) != 50:
        posts = []
    posts.sort(key=lambda item: item.get("published_at", ""), reverse=True)
    env = environment()

    for item in videos:
        item["generated"] = summary_for(content, f"video:{item['video_id']}")
    for item in publications:
        item["generated"] = summary_for(content, f"publication:{item['pmid']}")

    render(env, "index.html", ROOT / "index.html", page="home", posts=posts[:5], videos=videos[:3], publications=publications[:6], projects=PROJECTS[:5])
    render(env, "posts.html", ROOT / "posts" / "index.html", page="posts", posts=posts)
    for item in posts:
        render(env, "post_detail.html", ROOT / "posts" / str(item["wordpress_id"]) / "index.html", page="posts", post=item)
    render(env, "videos.html", ROOT / "videos" / "index.html", page="videos", videos=videos)
    for item in videos:
        render(env, "video_detail.html", ROOT / "videos" / item["video_id"] / "index.html", page="videos", video=item)
    render(env, "publications.html", ROOT / "publications" / "index.html", page="publications", publications=publications)
    for item in publications:
        render(env, "publication_detail.html", ROOT / "publications" / item["pmid"] / "index.html", page="publications", publication=item)
    render(env, "projects.html", ROOT / "projects" / "index.html", page="projects", projects=PROJECTS)
    write_sitemap(videos, publications, posts)


def write_sitemap(videos, publications, posts):
    routes = ["/", "/posts/", "/videos/", "/publications/", "/projects/", "/google-timeline-visualizer/"]
    routes += [f"/posts/{item['wordpress_id']}/" for item in posts]
    routes += [f"/videos/{item['video_id']}/" for item in videos]
    routes += [f"/publications/{item['pmid']}/" for item in publications]
    body = "\n".join(f"  <url><loc>{BASE_URL}{route}</loc></url>" for route in routes)
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n</urlset>\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    build_site(offline=args.offline)
