import requests
import json

ORCID_ID = "0000-0003-2749-0014"

def fetch_orcid_education():
    url = f"https://pub.orcid.org/v3.0/{ORCID_ID}/educations"
    headers = {"Accept": "application/json"}
    
    try:
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            education_summary = data.get('education-summary', [])
            
            print("--- Education ---")
            for edu in education_summary:
                
                start_date = edu.get('start-date', {})
                end_date = edu.get('end-date', {})
                
                start_year = start_date.get('year', {}).get('value') if start_date else "?"
                end_year = end_date.get('year', {}).get('value') if end_date else "Present"
                
                role = edu.get('role-title', '')
                org = edu.get('organization', {}).get('name', '')
                dept = edu.get('department-name', '')
                
                print(f"{start_year} - {end_year}: {role} at {org} ({dept})")
                
        else:
            print(f"Error: {resp.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")

def fetch_orcid_employment():
    url = f"https://pub.orcid.org/v3.0/{ORCID_ID}/employments"
    headers = {"Accept": "application/json"}
    
    try:
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            employment_summary = data.get('employment-summary', [])
            
            print("\n--- Employment ---")
            for emp in employment_summary:
                start_date = emp.get('start-date', {})
                end_date = emp.get('end-date', {})
                
                start_year = start_date.get('year', {}).get('value') if start_date else "?"
                end_year = end_date.get('year', {}).get('value') if end_date else "Present"
                
                role = emp.get('role-title', '')
                org = emp.get('organization', {}).get('name', '')
                dept = emp.get('department-name', '')
                
                print(f"{start_year} - {end_year}: {role} at {org} ({dept})")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_orcid_education()
    fetch_orcid_employment()
