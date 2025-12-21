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

    def get_events(self, query: str = None) -> List[Event]:
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
