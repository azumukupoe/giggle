import requests
from typing import List
from datetime import datetime
from .base import BaseConnector, Event
import os

class TicketmasterConnector(BaseConnector):
    def __init__(self, api_key: str = None):
        super().__init__()
        self.api_key = api_key or os.environ.get("TICKETMASTER_API_KEY")
        self.base_url = "https://app.ticketmaster.com/discovery/v2"

    def get_events(self, country_code: str = "JP", limit: int = 100) -> List[Event]:
        """
        Fetches 'Discovery' events for a whole country, not specific to an artist.
        """
        if not self.api_key:
            print("Ticketmaster API Key missing.")
            return []

        # 1. Broad Search: Japan
        url = f"{self.base_url}/events.json?classificationName=music&countryCode={country_code}&size={limit}&sort=date,asc&apikey={self.api_key}"
        
        try:
            print(f"  [Ticketmaster] Broad search URL: {url.replace(self.api_key, 'HIDDEN_KEY')}")
            resp = requests.get(url)
            print(f"  [Ticketmaster] Status: {resp.status_code}")
            
            if resp.status_code != 200:
                print(f"  [Ticketmaster] Error Body: {resp.text}")
                resp.raise_for_status()

            data = resp.json()
            
            # Fallback: Try "Tokyo" explicit city search if country search fails (sometimes works better)
            if '_embedded' not in data or not data['_embedded'].get('events'):
                print("  [Ticketmaster] 'countryCode=JP' returned 0. Retrying with 'city=Tokyo'...")
                url = f"{self.base_url}/events.json?classificationName=music&city=Tokyo&size={limit}&apikey={self.api_key}"
                resp = requests.get(url)
                data = resp.json()

            if '_embedded' not in data:
                print(f"  [Ticketmaster] Zero results found. Raw Data Keys: {data.keys()}")
                return []
            
            events_data = data['_embedded'].get('events', [])
            print(f"  [Ticketmaster] Raw event count: {len(events_data)}")
            
            events = []
            for item in events_data:
                # Ticketmaster dates
                start = item.get('dates', {}).get('start', {})
                date_str = f"{start.get('localDate')}T{start.get('localTime', '00:00:00')}"
                try:
                    event_date = datetime.fromisoformat(date_str)
                except:
                    continue 

                venue_info = item.get('_embedded', {}).get('venues', [{}])[0]
                city = venue_info.get('city', {}).get('name', 'Unknown City')
                country = venue_info.get('country', {}).get('name', 'Unknown Country')
                location = f"{city}, {country}"
                
                # Filter artists
                # Ticketmaster returns a list of attractions. We'll grab the first one as the 'primary' artist.
                attractions = item.get('_embedded', {}).get('attractions', [])
                artist_name = attractions[0]['name'] if attractions else item.get('name')

                images = item.get('images', [])
                image_url = images[0]['url'] if images else None

                event = Event(
                    title=item.get('name'),
                    artist=artist_name,
                    venue=venue_info.get('name', 'Unknown Venue'),
                    location=location,
                    date=event_date,
                    url=item.get('url'),
                    image_url=image_url,
                    source="ticketmaster",
                    external_id=item.get('id')
                )
                events.append(event)
            return events

        except Exception as e:
            print(f"Error fetching discovery events from Ticketmaster: {e}")
            return []

    def get_artist_events(self, artist_name: str) -> List[Event]:
        if not self.api_key:
            print("Ticketmaster API Key missing.")
            return []

        url = f"{self.base_url}/events.json?keyword={artist_name}&apikey={self.api_key}&classificationName=music&countryCode=JP"
        
        try:
            resp = requests.get(url)
            resp.raise_for_status()
            data = resp.json()
            
            if '_embedded' not in data:
                return []

            events = []
            for item in data['_embedded'].get('events', []):
                # Ticketmaster dates
                start = item.get('dates', {}).get('start', {})
                date_str = f"{start.get('localDate')}T{start.get('localTime', '00:00:00')}"
                try:
                    event_date = datetime.fromisoformat(date_str)
                except:
                    continue # Skip if date is weird

                venue_info = item.get('_embedded', {}).get('venues', [{}])[0]
                location = f"{venue_info.get('city', {}).get('name')}, {venue_info.get('country', {}).get('name')}"
                
                images = item.get('images', [])
                image_url = images[0]['url'] if images else None

                event = Event(
                    title=item.get('name'),
                    artist=artist_name,
                    venue=venue_info.get('name', 'Unknown Venue'),
                    location=location,
                    date=event_date,
                    url=item.get('url'),
                    image_url=image_url,
                    source="ticketmaster",
                    external_id=item.get('id')
                )
                events.append(event)
            return events

        except Exception as e:
            print(f"Error fetching from Ticketmaster: {e}")
            return []
