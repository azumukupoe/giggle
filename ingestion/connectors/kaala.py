import requests
from bs4 import BeautifulSoup
from datetime import datetime
try:
    from connectors.base import Connector, Event
except ImportError:
    from .base import Connector, Event
import re

class KaalaConnector(Connector):
    def get_events(self):
        url = "https://www.kaalamusic.com/events"
        print(f"  [Kaala] Scraping: {url}")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        events = []
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code != 200:
                print(f"  [Kaala] Failed to fetch: {response.status_code}")
                return []

            soup = BeautifulSoup(response.content, 'html.parser')
            # Squarespace event list
            articles = soup.find_all('article', class_='eventlist-event')
            print(f"  [Kaala] Found {len(articles)} items.")
            
            for article in articles:
                try:
                    # Title & Link
                    title_tag = article.find('h1', class_='eventlist-title')
                    if not title_tag: continue
                    link_tag = title_tag.find('a')
                    if not link_tag: continue
                    
                    title = link_tag.get_text(strip=True)
                    link = "https://www.kaalamusic.com" + link_tag.get('href')
                    
                    # Date
                    date_tag = article.find('time', class_='event-date')
                    if date_tag and date_tag.get('datetime'):
                        date_str = date_tag.get('datetime')
                        # format: 2025-12-25
                        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                    else:
                        date_obj = datetime.now()

                    # Time
                    time_tag = article.find('time', class_='event-time-localized-start')
                    if time_tag:
                         # 5:30 PM. Combine with date if needed, but for now we just store the date object
                         # potentially adding time if we parsed it properly.
                         # simple approach: keep date_obj as date-only or strict datetime
                         pass

                    # Image
                    img_tag = article.find('img')
                    img_url = None
                    if img_tag:
                        img_url = img_tag.get('data-src') or img_tag.get('src')

                    # Location
                    location = "Japan"
                    address_li = article.find('li', class_='eventlist-meta-address')
                    if address_li:
                        # usually contains text or a map link
                        # Extract text
                        loc_text = address_li.get_text(" ", strip=True) 
                        loc_text = loc_text.replace("(map)", "").strip()
                        if loc_text:
                            location = loc_text

                    events.append(Event(
                        title=title,
                        date=date_obj,
                        location=location,
                        url=link,
                        image=img_url,
                        source="Kaala"
                    ))
                except Exception as e:
                    print(f"  [Kaala] Error parsing item: {e}")
                    continue

        except Exception as e:
            print(f"  [Kaala] Error: {e}")
            
        return events
