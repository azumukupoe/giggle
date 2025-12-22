import requests
from bs4 import BeautifulSoup
import re
import json
import time

def scrape_all_ids():
    base_url = "https://www.songkick.com/search"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    unique_metros = {} # ID -> Name
    page = 1
    
    while True:
        print(f"Scraping page {page}...")
        params = {
            'page': page,
            'per_page': 10,
            'query': 'japan',
            'type': 'cities'
        }
        
        try:
            resp = requests.get(base_url, params=params, headers=headers)
            if resp.status_code != 200:
                print(f"Failed to fetch page {page}: {resp.status_code}")
                break
            
            soup = BeautifulSoup(resp.content, 'html.parser')
            
            # Find results
            # Results are typically in <li class="metro-area"> or via links
            # Based on the read_url_content output, we saw links like:
            # https://www.songkick.com/metro-areas/30717-japan-tokyo
            
            links = soup.find_all('a', href=re.compile(r'/metro-areas/(\d+)-.*'))
            
            if not links:
                print("No links found on this page. Stopping.")
                break
            
            search_results_container = soup.find('ul', class_='search-results')
            if not search_results_container:
                # If we can't find the container, maybe we just parse all links?
                # But let's check for "Next" button to be safe about stopping.
                pass

            found_new = False
            for link in links:
                href = link.get('href')
                match = re.search(r'/metro-areas/(\d+)-(.*)', href)
                if match:
                    mid = match.group(1)
                    slug = match.group(2) # e.g. japan-tokyo
                    
                    # The text might be "Tokyo, Japan" or "Tokyo, Japan including Kunitachi"
                    name = link.get_text(strip=True)
                    
                    # Clean up name: remove "including ..." if present
                    if "including" in name:
                         name = name.split(" including")[0].strip()
                    if "," in name: # "Tokyo, Japan"
                         name = name.split(",")[0].strip()

                    if mid not in unique_metros:
                        unique_metros[mid] = {
                            'name': name,
                            'slug': slug,
                            'full_slug': f"{mid}-{slug}"
                        }
                        found_new = True
            
            if not found_new:
                # If we didn't find any NEW metros, we might be looping or done?
                # But duplicates exist across pages or within pages.
                pass

            # Check for Next page
            # Pagination is usually <div class="pagination"> ... <a rel="next">
            next_link = soup.find('a', rel='next')
            if not next_link:
                print("No active 'Next' link found. Finished.")
                break
            
            page += 1
            time.sleep(1) # Be nice
            
        except Exception as e:
            print(f"Error on page {page}: {e}")
            break

    print(f"Found {len(unique_metros)} unique Metro IDs.")
    
    # Save to file
    with open('japan_metro_ids.json', 'w', encoding='utf-8') as f:
        json.dump(unique_metros, f, indent=2, ensure_ascii=False)
    
    print("Saved to japan_metro_ids.json")

if __name__ == "__main__":
    scrape_all_ids()
