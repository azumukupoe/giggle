import requests
from typing import List
from datetime import datetime
from .base import BaseConnector, Event
from bs4 import BeautifulSoup
import urllib.parse
import json

class SongkickConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://www.songkick.com"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

    def get_events(self, query: str = None) -> List[Event]:
        # Required by BaseConnector
        return []

    def get_metro_events(self, metro_id: str = "30717-japan-tokyo", max_pages: int = 5) -> List[Event]:
        """
        Fetches events for a specific metro area (e.g., Tokyo).
        Iterates through pages until max_pages or no events found.
        """
        all_events = []
        base_metro_url = f"{self.base_url}/metro-areas/{metro_id}"
        print(f"  [Songkick] Scraping metro area: {base_metro_url}")

        for page in range(1, max_pages + 1):
            url = f"{base_metro_url}?page={page}"
            print(f"  [Songkick] Fetching page {page}: {url}")
            
            try:
                resp = requests.get(url, headers=self.headers)
                # print(f"  [Songkick] Status: {resp.status_code}")
                
                if resp.status_code != 200:
                    print(f"  [Songkick] Failed to fetch page {page}. Status: {resp.status_code}")
                    break
                
                soup = BeautifulSoup(resp.content, 'html.parser')
                
                # JSON-LD extraction
                scripts = soup.find_all('script', type='application/ld+json')
                page_events = []
                
                found_json = False
                for script in scripts:
                    if 'MusicEvent' in script.text:
                        found_json = True
                        try:
                            data = json.loads(script.text)
                            items = data if isinstance(data, list) else [data]
                            for item in items:
                                if item.get('@type') == 'MusicEvent':
                                    # Identify artist
                                    performers = item.get('performer', [])
                                    if isinstance(performers, list) and performers:
                                        artist_name = performers[0].get('name', 'Unknown Artist')
                                    else:
                                        artist_name = item.get('name', 'Unknown Event')

                                    evt = self._parse_json_ld(item, artist_name)
                                    if evt: page_events.append(evt)
                        except Exception as e:
                            print(f"    [Songkick] JSON Load Error on page {page}: {e}")
                
                if not found_json and page == 1:
                     print("  [Songkick] Warning: No JSON-LD found on page 1.")
                
                if not page_events:
                    print(f"  [Songkick] No events found on page {page}. Stopping.")
                    break
                
                print(f"    -> Found {len(page_events)} events on page {page}.")
                all_events.extend(page_events)

                # Optional: Check for "Next" button specifically?
                # Usually if 0 events returned we are done.
                
            except Exception as e:
                print(f"Error scraping Songkick metro page {page}: {e}")
                break
        
        return all_events

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # Songkick scraping is 2-step: Search -> User Page -> Calendar
        # Step 1: Search
        search_url = f"{self.base_url}/search?query={urllib.parse.quote(artist_name)}&type=artists"
        try:
            s_resp = requests.get(search_url, headers=self.headers)
            s_soup = BeautifulSoup(s_resp.content, 'html.parser')
            
            # Find first result
            # Selectors need to be robust. Usually <li class="artist"> <a href="...">
            result_link = s_soup.select_one('.artist-results .artist h4 a')
            if not result_link:
                print(f"Artist not found on Songkick: {artist_name}")
                return []
            
            artist_url = f"{self.base_url}{result_link['href']}/calendar"
            
            # Step 2: Get Calendar
            c_resp = requests.get(artist_url, headers=self.headers)
            c_soup = BeautifulSoup(c_resp.content, 'html.parser')
            
            events = []
            # Songkick also uses JSON-LD often!
            scripts = c_soup.find_all('script', type='application/ld+json')
            for script in scripts:
                if 'MusicEvent' in script.text:
                    try:
                        data = json.loads(script.text)
                        items = data if isinstance(data, list) else [data]
                        for item in items:
                             if item.get('@type') == 'MusicEvent':
                                evt = self._parse_json_ld(item, artist_name)
                                if evt: events.append(evt)
                    except:
                        continue
            
            return events

        except Exception as e:
            print(f"Error scraping Songkick: {e}")
            return []

    def _parse_json_ld(self, item, artist_name):
        # Same logic as BIT essentially, standard Schema.org
        try:
            date_str = item.get('startDate')
            if not date_str: return None
            event_date = datetime.fromisoformat(date_str)
            
            venue = item.get('location', {})
            venue_name = venue.get('name', 'Unknown')
            address = venue.get('address', {})
            if isinstance(address, dict):
                 loc = f"{address.get('addressLocality')}, {address.get('addressCountry')}"
            else:
                 loc = str(address)

            title = item.get('name', 'Unknown Event')
            
            # 1. Check JSON-LD for tour/superEvent (Fast)
            tour_info = item.get('tour') or item.get('superEvent')
            tour_name = None
            if isinstance(tour_info, dict):
                tour_name = tour_info.get('name')
            
            # 2. If not in JSON, scrape the detail page (Slow but accurate)
            # Only do this if we have a URL and not too many requests (maybe limit concurrency or just accept it's slower)
            url = item.get('url')
            if not tour_name and url:
                 # Check if we should fetch detailed info (maybe logic to skip if title is already long?)
                 # For now, fetch to ensure correctness as per user request
                 tour_name = self._get_tour_name_from_page(url)

            if tour_name and tour_name not in title:
                title = f"{tour_name} - {title}"
            
            return Event(
                # Use 'name' for title (usually contains Tour Name or Event Title)
                title=title, 
                artist=artist_name,
                venue=venue_name,
                location=loc,
                date=event_date,
                url=item.get('url'),
                image_url=item.get('image'),
                source='songkick',
                external_id=item.get('url')
            )
        except Exception as e:
            print(f"Error parsing JSON-LD item: {e}")
            return None

    def _get_tour_name_from_page(self, url: str) -> str:
        """
        Fetches the event detail page and looks for 'Tour name' in Additional Details.
        Returns the tour name string or None.
        """
        try:
            # print(f"    [Songkick] Checking detail page for tour info: {url}")
            resp = requests.get(url, headers=self.headers, timeout=10)
            if resp.status_code != 200: return None
            
            soup = BeautifulSoup(resp.content, 'html.parser')
            
            # Look for "Additional details" header
            # Structure: <h2>Additional details</h2> <p>Tour name: XXX</p> or <div>Tour name:XXX</div>
            # We can search for the text "Tour name:" directly
            target = soup.find(string=lambda t: t and "Tour name:" in t)
            if target:
                # Cleanup: "Tour name: CROSSFADES" -> "CROSSFADES"
                text = target.strip()
                if text.startswith("Tour name:"):
                    return text.replace("Tour name:", "").strip()
                # If it's in a parent element
                parent_text = target.parent.get_text(strip=True)
                if parent_text.startswith("Tour name:"):
                     return parent_text.replace("Tour name:", "").strip()

            return None
        except Exception as e:
            # print(f"    [Songkick] Detail scrape failed: {e}")
            return None
