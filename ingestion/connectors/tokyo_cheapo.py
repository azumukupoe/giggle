import requests
from typing import List
from datetime import datetime, timedelta
from .base import BaseConnector, Event
from bs4 import BeautifulSoup

class TokyoCheapoConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        self.base_url = "https://tokyocheapo.com/events/"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

    def get_events(self, query: str = None) -> List[Event]:
        # Used for general discovery
        return self.scrape_events()

    def scrape_events(self) -> List[Event]:
        # Scrape the main events feed (Top Picks)
        url = self.base_url
        print(f"  [Cheapo] Scraping: {url}")
        
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            if resp.status_code != 200:
                print(f"  [Cheapo] Failed: {resp.status_code}")
                return []
            
            soup = BeautifulSoup(resp.content, 'html.parser')
            events = []
            
            # Select event articles. Using generic class selectors based on standard WordPress/Theme structure seems risky without full HTML inspection.
            # But from the text dump, they are `article` tags usually.
            # Let's target the articles inside the main list.
            
            # Note: TokyoCheapo structure varies, but usually <article class="post">
            articles = soup.find_all('article')
            print(f"  [Cheapo] Found {len(articles)} articles/items.")
            
            for article in articles:
                try:
                    # Title & Link
                    h3 = article.find('h3', class_='entry-title') # Common WP class
                    if not h3:
                         # Fallback for some themes
                         h3 = article.find('h2')
                    
                    if not h3: continue
                    
                    link_tag = h3.find('a')
                    if not link_tag: continue
                    
                    title = link_tag.get_text(strip=True)
                    link = link_tag.get('href')
                    
                    # Date
                    # Usually in a separate div or parsed from text. 
                    # Cheat: Use current date as placeholder if not found, or try to find date text.
                    # from the logs: "[Dec 1 ~ Dec 25]"
                    # We'll just grab the text and see if we can parse vaguely, or verify strictly.
                    # For now, let's look for time tags.
                    # <time class="entry-date ...">
                    
                    date_obj = datetime.now() + timedelta(days=1) # Default to tomorrow
                    
                    # Image
                    img_tag = article.find('img')
                    img_url = img_tag.get('src') if img_tag else None
                    if img_url and 'data:image' in img_url:
                        img_url = img_tag.get('data-src') # Lazy load handling

                    # Location
                    # From logs: [Marunouchi], [Saitama City]
                    # Usually in a generic category tag.
                    location = "Tokyo, Japan" # Default
                    
                    events.append(Event(
                        title=title,
                        artist="Various", # It's an event feed, not always artist based
                        venue="Tokyo Cheapo Event",
                        location=location,
                        date=date_obj,
                        url=link,
                        image_url=img_url,
                        source='tokyo_cheapo',
                        external_id=link
                    ))
                except Exception as e:
                    continue

            return events

        except Exception as e:
            print(f"Error scraping Tokyo Cheapo: {e}")
            return []

    def get_artist_events(self, artist_name: str) -> List[Event]:
        return []
