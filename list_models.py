import requests
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv('GEMINI_API_KEY')

print("🔍 Fetching available Gemini models...\n")

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"

try:
    response = requests.get(url, timeout=10)
    
    if response.status_code == 200:
        result = response.json()
        models = result.get('models', [])
        
        print(f"✅ Found {len(models)} models:\n")
        
        for model in models:
            name = model.get('name', 'Unknown')
            display_name = model.get('displayName', 'Unknown')
            methods = model.get('supportedGenerationMethods', [])
            
            # Only show models that support generateContent
            if 'generateContent' in methods:
                print(f"✓ {name}")
                print(f"  Display: {display_name}")
                print(f"  Methods: {', '.join(methods)}")
                print()
    else:
        print(f"❌ Error: {response.status_code}")
        print(response.text)
        
except Exception as e:
    print(f"❌ Error: {e}")