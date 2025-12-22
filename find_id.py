import requests
import re

def find_id(city):
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
    url = f"https://www.songkick.com/search?query={city}&type=metro_areas"
    print(f"Searching {url}...")
    try:
        r = requests.get(url, headers=headers)
        print(f"Status: {r.status_code}")
        # Look for /metro-areas/12345-name
        match = re.search(r'metro-areas/(\d+)-', r.text)
        if match:
            print(f"FOUND ID for {city}: {match.group(1)}")
        else:
            print(f"No ID found for {city}")
    except Exception as e:
        print(f"Error: {e}")

find_id("Osaka")
find_id("Nagoya")
find_id("Kyoto")
