import requests
import json

DOI = "10.3343/alm.2025.0422" # "Large Language Model Advances..."
ORCID_ID = "0000-0003-2749-0014"

def get_orcid_details():
    url = f"https://pub.orcid.org/v3.0/{ORCID_ID}/works"
    headers = {"Accept": "application/json"}
    resp = requests.get(url, headers=headers)
    if resp.status_code == 200:
        groups = resp.json().get('group', [])
        for g in groups:
            s = g['work-summary'][0]
            # Check if this is the one
            for eid in s.get('external-ids', {}).get('external-id', []):
                if eid['external-id-value'] == DOI:
                    return s
    return None

def get_pubmed_details(doi):
    # 1. Search for PMID
    search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    params = {"db": "pubmed", "term": doi, "retmode": "json"}
    resp = requests.get(search_url, params=params)
    if resp.status_code != 200: return None
    
    ids = resp.json().get('esearchresult', {}).get('idlist', [])
    if not ids: return None
    pmid = ids[0]
    
    # 2. Get Summary
    # summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    # params = {"db": "pubmed", "id": pmid, "retmode": "json"}
    # resp = requests.get(summary_url, params=params)
    # This gives basic info. efetch gives XML with abstracts.
    
    # Let's try efetch for full details including abstract
    fetch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    params = {"db": "pubmed", "id": pmid, "retmode": "xml"}
    resp = requests.get(fetch_url, params=params)
    return resp.text # It's XML, but valid for checking presence of abstract/authors

print("--- ORCID Data ---")
orcid_data = get_orcid_details()
print(json.dumps(orcid_data, indent=2))

print("\n--- PubMed Data (preview) ---")
pubmed_xml = get_pubmed_details(DOI)
print(pubmed_xml[:1000] if pubmed_xml else "No PubMed data")
