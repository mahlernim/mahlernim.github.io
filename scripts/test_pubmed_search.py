import requests
import json

# Try different search terms to see what works best
TERMS = [
    "Ahn Sangzin[Author]",
    "Sangzin Ahn[Author]",
    "Ahn S[Author] AND Inje University[Affiliation]"
]

def search_pubmed(term):
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    params = {
        "db": "pubmed",
        "term": term,
        "retmode": "json",
        "retmax": 50
    }
    try:
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            return resp.json().get('esearchresult', {}).get('idlist', [])
    except Exception as e:
        print(f"Error: {e}")
    return []

def fetch_summaries(ids):
    if not ids: return []
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    params = {
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "json"
    }
    try:
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            return resp.json().get('result', {})
    except Exception as e:
        print(f"Error: {e}")
    return {}

def main():
    for term in TERMS:
        print(f"\nSearching for: {term}")
        ids = search_pubmed(term)
        print(f"Found {len(ids)} items.")
        
        if ids:
            # Fetch details for first 5 to verify author match
            summaries = fetch_summaries(ids)
            for uid in ids[:5]:
                if uid in summaries:
                    item = summaries[uid]
                    title = item.get('title', 'No Title')
                    authors = [a['name'] for a in item.get('authors', [])]
                    source = item.get('source', '')
                    print(f"- {title}")
                    print(f"  Source: {source}, Authors: {', '.join(authors[:3])}...")

if __name__ == "__main__":
    main()
