import requests
import json
from typing import List
from datetime import datetime
from .base import BaseConnector, Event
from bs4 import BeautifulSoup
import urllib.parse

class ResidentAdvisorConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://ra.co"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }

    def get_events(self, query: str = None) -> List[Event]:
        # Not used for discovery
        return []

    def get_location_events(self, location_slug: str) -> List[Event]:
        """
        Scrapes RA events for a specific location (e.g., 'jp/tokyo', 'jp/osaka').
        """
        url = f"{self.base_url}/events/{location_slug}"
        print(f"  [RA] Scraping: {url}")
        
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            print(f"  [RA] Status: {resp.status_code}")
            
            if resp.status_code != 200:
                print(f"  [RA] Failed to fetch. Status: {resp.status_code}")
                return []
            
            soup = BeautifulSoup(resp.content, 'html.parser')
            events = []
            
            # RA uses JSON-LD for event lists nicely.
            scripts = soup.find_all('script', type='application/ld+json')
            print(f"  [RA] Found {len(scripts)} JSON-LD scripts.")
            
            for script in scripts:
                if 'Event' in script.text or 'MusicEvent' in script.text:
                    try:
                        data = json.loads(script.text)
                        items = data if isinstance(data, list) else [data]
                        
                        # Sometimes RA wraps listing in a specialized object, but usually it's a list or single MusicEvent
                        if isinstance(data, dict) and '@graph' in data:
                             items = data['@graph']

                        for item in items:
                            if item.get('@type') in ['Event', 'MusicEvent', 'DanceEvent']:
                                evt = self._parse_json_ld(item)
                                if evt: events.append(evt)
                    except Exception as e:
                        print(f"    [RA] JSON Parse Error: {e}")

            return events

        except Exception as e:
            print(f"Error scraping RA: {e}")
            return []

    def _parse_json_ld(self, item):
        try:
            # RA specific fields
            name = item.get('name')
            url = item.get('url')
            image = item.get('image')
            start_date = item.get('startDate')
            
            if not start_date or not name: return None
            
            try:
                date = datetime.fromisoformat(start_date)
            except:
                date = datetime.now() # Fallback

            location = item.get('location', {})
            venue_name = location.get('name', 'Unknown Venue')
            address = location.get('address', {})
            if isinstance(address, dict):
                 city = address.get('addressLocality', '')
                 country = address.get('addressCountry', '')
                 loc_str = f"{city}, {country}"
            else:
                 loc_str = str(address)

            # Artist extraction
            performers = item.get('performer', [])
            if isinstance(performers, list) and performers:
                artist = performers[0].get('name')
            elif isinstance(performers, dict):
                artist = performers.get('name')
            else:
                artist = name

            return Event(
                title=name,
                artist=artist,
                venue=venue_name,
                location=loc_str,
                date=date,
                url=url,
                image_url=image,
                source='resident_advisor',
                external_id=url
            )
        except Exception as e:
            return None

    def get_artist_events(self, artist_name: str) -> List[Event]:
        return []
