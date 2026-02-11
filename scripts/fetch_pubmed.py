import requests
import xml.etree.ElementTree as ET
import time
import os
import json
from datetime import datetime

# Combined search for variations
SEARCH_TERM = "Ahn Sangzin[Author] OR Sangzin Ahn[Author]" 

def fetch_pubmed_ids(term):
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    today = datetime.now().strftime("%Y/%m/%d")
    # Search last 1 year (365 days)
    # We can use reldate or explicit date range. reldate is easier.
    params = {
        "db": "pubmed",
        "term": term,
        "retmode": "json",
        "retmax": 100,
        "reldate": 365  # Last 365 days
    }
    try:
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            return resp.json().get('esearchresult', {}).get('idlist', [])
    except Exception as e:
        print(f"Error searching PubMed: {e}")
    return []

def format_author(last, initials, target_last="Ahn", target_initial="S"):
    """Format author name and underline if it matches target."""
    name = f"{last} {initials}"
    # Check match (case insensitive)
    if last.lower() == target_last.lower() and (initials.startswith(target_initial) or initials == target_initial):
        return f"<u>{name}</u>"
    return name

CACHE_FILE = os.path.join(os.path.dirname(__file__), '../data/publications_cache.json')

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def map_category(types):
    """Map PubMed types to simplified categories."""
    if "Review" in types: return "Review"
    if "Editorial" in types: return "Editorial"
    if "Published Erratum" in types: return "Erratum"
    return "Original Article"

def fetch_details_with_cache(ids):
    cache = load_cache()
    
    # Identify what's missing
    missing_ids = [pid for pid in ids if pid not in cache]
    
    if missing_ids:
        print(f"Fetching details for {len(missing_ids)} new papers...")
        new_works = fetch_details(missing_ids)
        
        # Update cache
        for work in new_works:
            cache[work['pmid']] = work
            
        save_cache(cache)
    else:
        print("All papers found in cache.")
        
    # Return all requested works from cache
    return [cache[pid] for pid in ids if pid in cache]

def fetch_details(ids):
    # ... (existing fetch_details logic but adapted to return dict with PMID key or just list) ...
    # Actually, easiest is to keep fetch_details as is (fetching list) and wrap it.
    # But wait, fetch_details takes a list of IDs.
    
    if not ids: return []
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    params = {
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "xml"
    }
    
    works = []
    try:
        resp = requests.get(url, params=params)
        if resp.status_code != 200:
            print(f"Error fetching details: {resp.status_code}")
            return []
            
        root = ET.fromstring(resp.content)
        
        for article in root.findall(".//PubmedArticle"):
            # ... (extraction logic) ...
            title = article.findtext(".//ArticleTitle")
            
            # year
            pub_date = article.find(".//PubDate")
            year = pub_date.findtext("Year")
            if not year:
                medline_date = pub_date.findtext("MedlineDate")
                if medline_date: year = medline_date[:4]
            
            # Journal
            journal = article.findtext(".//Journal/ISOAbbreviation") or article.findtext(".//Journal/Title")
            
            # DOI / PMID
            pmid = article.findtext(".//PMID")
            doi = None
            for id_elem in article.findall(".//ArticleIdList/ArticleId"):
                if id_elem.get("IdType") == "doi":
                    doi = id_elem.text
                    break
            url_link = f"https://doi.org/{doi}" if doi else f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            
            # Authors
            author_list = []
            for auth in article.findall(".//AuthorList/Author"):
                last = auth.findtext("LastName")
                initials = auth.findtext("Initials")
                if last and initials:
                    author_list.append(format_author(last, initials))
                elif auth.findtext("CollectiveName"):
                    author_list.append(auth.findtext("CollectiveName"))
            
            # Categories
            types = [t.text for t in article.findall(".//PublicationTypeList/PublicationType")]
            category = map_category(types)

            works.append({
                "title": title,
                "year": int(year) if year and year.isdigit() else 0,
                "journal": journal,
                "authors": ", ".join(author_list),
                "url": url_link,
                "doi": doi,
                "pmid": pmid,
                "category": category
            })
            
    except Exception as e:
        print(f"Error parsing XML: {e}")
        
    return works

def fetch_works():
    print(f"Searching PubMed for: {SEARCH_TERM}")
    ids = fetch_pubmed_ids(SEARCH_TERM)
    print(f"Found {len(ids)} papers.")
    
    if ids:
        # Update cache with any new findings
        fetch_details_with_cache(ids)
    
    # Return ALL papers from cache, not just the recent search results
    cache = load_cache()
    all_works = list(cache.values())
    
    # Sort by year desc
    all_works.sort(key=lambda x: x['year'], reverse=True)
    return all_works

if __name__ == "__main__":
    w = fetch_works()
    print(f"Fetched {len(w)} items.")
    if w:
        print(w[0])
