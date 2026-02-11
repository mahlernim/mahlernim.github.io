import os
import json
from datetime import datetime
from scripts.fetch_pubmed import fetch_works
from scripts.fetch_youtube import fetch_videos
from jinja2 import Environment, FileSystemLoader

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')
OUTPUT_DIR = BASE_DIR
STATIC_DIR = os.path.join(BASE_DIR, 'static')

def build_site():
    print("Starting site build...")
    
    # 1. Fetch Data
    print("Fetching Publications (PubMed)...")
    publications = fetch_works()
    
    print("Fetching YouTube Videos...")
    videos = fetch_videos()
    
    # 2. Prepare Context
    context = {
        "publications": publications,
        "videos": videos,
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "author": {
            "name": "안상진 (Sangzin Ahn)",
            "title": "인제대학교 의과대학 약리학교실 부교수",
            "affiliation": "Associate Professor, Dept. of Pharmacology, Inje Univ. College of Medicine",
            "research_interests": [
                "의학교육에서 대형언어모델 활용 (LLMs in Medical Education)",
                "의학연구에서 대형언어모델 적용 (LLM application in Medical Research)"
            ],
            "education": [
                "2009.03-2016.02: 의학박사 - 서울대학교 의과학과 약리학 전공(석박통합과정)",
                "2003.03-2009.02: 의학사 - 서울대학교 의과대학"
            ],
            "announcement": "정말 죄송하게도 경남 일대를 제외한 지역은 오가면서 낭비되는 시간, 체력적인 부담, 지방 연자를 위한 배려가 부족한 강연료 규정 등의 여러 이유로 현장강의를 고사하고 있습니다. 부디 너그러운 양해 부탁드립니다.",
            "email": "sangzinahn@gmail.com",
            "scholar": "https://scholar.google.com/citations?hl=ko&user=Xe825ZgAAAAJ&view_op=list_works&sortby=pubdate",
            "orcid": "https://orcid.org/0000-0003-2749-0014",
            "youtube": "https://youtube.com/playlist?list=PL0TnWnPQhDj2-TOwiz_ZhY2Sdurimss2Q&si=AwUfSKzzw1Oq_PdE"
        }
    }
    
    # 3. Render Template
    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
    template = env.get_template('index.html')
    output_html = template.render(context)
    
    # 4. Write Output
    output_path = os.path.join(OUTPUT_DIR, 'index.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(output_html)
        
    print(f"Site built successfully at {output_path}")

if __name__ == "__main__":
    # Ensure run from website root for imports to work if running as script
    # But usually run as python -m scripts.build or similar
    # For now, let's just make sure we can import
    import sys
    sys.path.append(BASE_DIR)
    build_site()
