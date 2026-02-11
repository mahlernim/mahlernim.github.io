import json
import os
from openai import OpenAI
from dotenv import load_dotenv

# Load .env file
load_dotenv()

CACHE_FILE = os.path.join(os.path.dirname(__file__), '../data/publications_cache.json')
API_KEY = os.getenv("OPENAI_API_KEY")

if not API_KEY:
    print("Error: OPENAI_API_KEY not found in .env file.")
    print("Please create a .env file with your API key: OPENAI_API_KEY=sk-...")
    exit(1)

client = OpenAI(api_key=API_KEY)

THEMES = [
    "Medical AI & Data Science",
    "Pharmacology & Precision Med.",
    "Neuroscience",
    "Education & Public Health"
]

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def categorize_title(title):
    prompt = f"""
    Classify the following medical research paper title into exactly one of these categories:
    {', '.join(THEMES)}

    Rules:
    - If the paper mentions "curriculum", "students", "teaching", "education", "assignment", or "flipped class", it MUST be "Education & Public Health", even if it uses AI.
    - If it's about drug metabolism, pharmacokinetics (PK), CYP, or dosage, it's "Pharmacology & Precision Med.".
    - If it's about brain, depression, autism, or neurons, it's "Neuroscience".
    - Otherwise, if it mentions AI, LLM, or ChatGPT, it's "Medical AI & Data Science".

    Title: "{title}"
    
    Return ONLY the category name.
    """
    
    try:
        completion = client.chat.completions.create(
            model="gpt-5-nano", # or gpt-5-nano if available to user
            messages=[
                {"role": "system", "content": "You are a skillful medical librarian."},
                {"role": "user", "content": prompt}
            ]
        )
        category = completion.choices[0].message.content.strip()
        
        # Validation
        if category not in THEMES:
            print(f"Warning: LLM returned unknown category '{category}'. Defaulting to 'Medical AI & Data Science'")
            return "Medical AI & Data Science"
            
        return category
    except Exception as e:
        print(f"Error calling LLM: {e}")
        return "Medical AI & Data Science"

def main():
    cache = load_cache()
    updated_count = 0
    
    print("Checking for papers without themes...")
    
    for pmid, data in cache.items():
        if "theme" not in data or not data["theme"]:
            print(f"Categorizing: {data['title'][:50]}...")
            theme = categorize_title(data['title'])
            data["theme"] = theme
            print(f" -> Assigned: {theme}")
            updated_count += 1
            
    if updated_count > 0:
        save_cache(cache)
        print(f"Updated {updated_count} papers.")
    else:
        print("All papers already have themes.")

if __name__ == "__main__":
    main()
