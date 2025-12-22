
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List
from .base import BaseConnector, Event
import re

class PiaConnector(BaseConnector):
    def get_events(self) -> List[Event]:
        events = []
        url = "https://t.pia.jp/pia/rlsInfo.do"
        # Params for "Music" (lg=01)
        params = {
            "rlsIn": "0",
            "perfIn": "0",
            "includeSaleEnd": "true",
            "lg": "01",
            "page": "1",
            "responsive": "true",
            "noConvert": "true",
            "searchMode": "1",
            "mode": "2",
            "dispMode": "1"
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Referer": "https://t.pia.jp/pia/search_all.do"
        }

        try:
            resp = requests.get(url, params=params, headers=headers)
            # resp.encoding = 'utf-8' # Reverted to let requests handle it
            
            if resp.status_code != 200:
                print(f"  [Pia] Error: Status {resp.status_code}")
                return []

            # Use resp.content so BS4 can detect encoding from bytes/meta
            soup = BeautifulSoup(resp.content, 'html.parser')

            # Check for maintenance
            if "ただいまシステムメンテナンス中です" in soup.get_text() or "system maintenance" in soup.get_text().lower():
                print(f"  [Pia] WARNING: System Maintenance in progress (usually Tue/Wed 2:30-5:30 AM JST).")
                return []

            event_links = soup.select('div.event_link')
            
            print(f"  [Pia] Found {len(event_links)} event items.")

            for div in event_links:
                try:
                    # Title
                    title_tag = div.select_one('li.is_title')
                    title = title_tag.get_text(strip=True) if title_tag else "Unknown Title"
                    
                    # URL
                    a_tag = div.find('a', href=True)
                    link = a_tag['href'] if a_tag else ""
                    if link.startswith('/'):
                        link = f"https://t.pia.jp{link}"
                    elif not link.startswith('http'):
                        link = f"https://t.pia.jp/{link}"

                    # External ID
                    external_id = "unknown"
                    if "eventCd=" in link:
                        match = re.search(r'eventCd=(\d+)', link)
                        if match:
                            external_id = match.group(1)
                    
                    # Date
                    date_obj = None
                    time_tag = div.select_one('time[itemprop="startDate"]')
                    if time_tag and time_tag.has_attr('datetime'):
                        dt_str = time_tag['datetime']
                        try:
                            date_obj = datetime.fromisoformat(dt_str)
                        except ValueError:
                            pass
                    
                    if not date_obj:
                        date_text_container = div.select_one('li.is_date')
                        if date_text_container:
                            date_text = date_text_container.get_text(strip=True)
                            match = re.search(r'(\d{4}/\d{1,2}/\d{1,2})', date_text)
                            if match:
                               date_obj = datetime.strptime(match.group(1), "%Y/%m/%d")

                    # Venue & Location
                    venue = "Unknown Venue"
                    place_tag = div.select_one('li.is_place span[itemprop="name"]')
                    if place_tag:
                         venue = place_tag.get_text(strip=True)
                    
                    location = "Japan"
                    region_tag = div.select_one('li.is_place span[itemprop="addressRegion"]')
                    if region_tag:
                        location = f"{region_tag.get_text(strip=True)}, Japan"

                    if title and link:
                        events.append(Event(
                            title=title,
                            venue=venue,
                            location=location,
                            date=date_obj or datetime.now(),
                            url=link,
                            image_url=None,
                            source="ticketpia",
                            artist=title,
                            external_id=external_id
                        ))

                except Exception as e:
                    print(f"  [Pia] Failed to parse item: {e}")
                    continue

        except Exception as e:
            print(f"  [Pia] Request failed: {e}")
        
        return events

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # Placeholder
        return [] 
