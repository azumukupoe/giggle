import requests
import json
from typing import List
from datetime import datetime
from .base import BaseConnector, Event
from bs4 import BeautifulSoup
import urllib.parse
import re

class BandsInTownConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://www.bandsintown.com"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

    def get_events(self, query: str = None) -> List[Event]:
        return []

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # Slugify: "Daft Punk" -> "daft-punk"
        slug = urllib.parse.quote(artist_name.lower().replace(" ", "-"))
        url = f"{self.base_url}/a/{slug}"
        
        try:
            print(f"DEBUG: Scraping URL: {url}")
            response = requests.get(url, headers=self.headers)
            if response.status_code == 404:
                print(f"Artist not found: {artist_name}")
                return []
            
            # Bandsintown has strong bot detection (403).
            # If 403, we might need to rely on a fallback or simpler method if possible.
            if response.status_code == 403:
                print("Blocked by Bandsintown (403).")
                return []

            soup = BeautifulSoup(response.content, 'html.parser')
            events = []

            # Strategy 1: JSON-LD
            scripts = soup.find_all('script', type='application/ld+json')
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
                        pass
            
            if events:
                 return events

            # Strategy 2: Next.js Hydration Data (Likely separate script)
            # Often found in <script id="__NEXT_DATA__" type="application/json">
            next_data = soup.find('script', id='__NEXT_DATA__')
            if next_data:
                try:
                    data = json.loads(next_data.text)
                    # Traverse data['props']['pageProps']['artistData']['events']
                    # Path might vary, need robust traversal
                    # This is hypothetical path based on common Next.js structures
                    artist_data = data.get('props', {}).get('pageProps', {})
                    # Look for anything looking like a list of events
                    # Inspecting keys helps if we were debugging interactively
                    pass # Placeholder for deep inspection implementation
                except:
                    pass

            return events

        except Exception as e:
            print(f"Error scraping Bandsintown: {e}")
            return []

    def _parse_json_ld(self, item, artist_name):
        try:
            date_str = item.get('startDate')
            if not date_str: return None
            
            # ISO format usually
            event_date = datetime.fromisoformat(date_str)
            
            venue = item.get('location', {})
            venue_name = venue.get('name', 'Unknown')
            address = venue.get('address', {})
            if isinstance(address, dict):
                loc = f"{address.get('addressLocality')}, {address.get('addressCountry')}"
            else:
                loc = str(address)

            return Event(
                title=item.get('name', f"{artist_name} Live"),
                artist=artist_name,
                venue=venue_name,
                location=loc,
                date=event_date,
                url=item.get('url'),
                image_url=item.get('image'),
                source='bandsintown',
                external_id=item.get('url')
            )
        except:
            return None
