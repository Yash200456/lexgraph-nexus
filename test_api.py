import requests
import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# Get API key
api_key = os.getenv('GEMINI_API_KEY')

print(f"🔑 API Key loaded: {api_key[:20]}... (first 20 chars)")
print(f"📏 API Key length: {len(api_key) if api_key else 0} characters")

if not api_key:
    print("❌ ERROR: API key is empty or not found!")
    print("💡 Check your .env file")
else:
    print("\n🧪 Testing API key with simple request...")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": [{
            "parts": [{
                "text": "Say hello in one word"
            }]
        }]
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            print("✅ SUCCESS! Your API key works perfectly!")
            result = response.json()
            answer = result['candidates'][0]['content']['parts'][0]['text']
            print(f"🤖 Gemini responded: {answer}")
        else:
            print(f"❌ ERROR: API returned status {response.status_code}")
            print(f"📄 Response: {response.text}")
    except Exception as e:
        print(f"❌ ERROR: {e}")