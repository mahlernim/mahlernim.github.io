import sys
import os

# Add the parent directory to sys.path to allow imports from scripts
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

import requests
import xml.etree.ElementTree as ET
from scripts.fetch_pubmed import fetch_pubmed_ids

SEARCH_TERM = "Ahn Sangzin[Author] OR Sangzin Ahn[Author]"

def check_categories():
    print(f"Searching for: {SEARCH_TERM}")
    ids = fetch_pubmed_ids(SEARCH_TERM)
    print(f"Found {len(ids)} papers. Checking categories...")
    
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    params = {
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "xml"
    }
    
    categories = {}
    
    try:
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            root = ET.fromstring(resp.content)
            for article in root.findall(".//PubmedArticle"):
                title = article.findtext(".//ArticleTitle")[:30] + "..."
                types = [t.text for t in article.findall(".//PublicationTypeList/PublicationType")]
                
                # print(f"- {title}: {types}")
                
                for t in types:
                    categories[t] = categories.get(t, 0) + 1
                    
    except Exception as e:
        print(f"Error: {e}")

    print("\n--- Summary of Categories ---")
    for cat, count in categories.items():
        print(f"{cat}: {count}")

if __name__ == "__main__":
    check_categories()
