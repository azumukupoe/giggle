import requests
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List
from .base import BaseConnector, Event
import re
import re
import time
import concurrent.futures


class PiaConnector(BaseConnector):
    def get_events(self, max_pages: int = None) -> List[Event]:
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

        page = 0
        while True:
            page += 1
            if max_pages and page > max_pages:
                break
            params["page"] = str(page)
            print(f"  [Pia] Fetching page {page}...")

            try:
                resp = requests.get(url, params=params, headers=headers)
                # FORCE UTF-8: TicketPia returns UTF-8 but sometimes headers are missing/wrong
                resp.encoding = 'UTF-8'
                
                if resp.status_code != 200:
                    print(f"  [Pia] Error: Status {resp.status_code} on page {page}")
                    break

                # Use resp.text now that encoding is forced
                soup = BeautifulSoup(resp.text, 'html.parser')

                # Check for maintenance
                if "ただいまシステムメンテナンス中です" in soup.get_text() or "system maintenance" in soup.get_text().lower():
                    print(f"  [Pia] WARNING: System Maintenance in progress (usually Tue/Wed 2:30-5:30 AM JST).")
                    break

                event_links = soup.select('div.event_link')
                
                if not event_links:
                    print(f"  [Pia] No events found on page {page}. Stopping.")
                    break

                print(f"  [Pia] Found {len(event_links)} event items on page {page}.")

                print(f"  [Pia] Found {len(event_links)} event items on page {page}.")

                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                    # Pass str(div) to ensure thread-safety for BeautifulSoup
                    futures = [executor.submit(self._process_event_div, str(div)) for div in event_links]
                    
                    for future in concurrent.futures.as_completed(futures):
                        try:
                            result = future.result()
                            if result:
                                events.append(result)
                        except Exception as e:
                            pass

            except Exception as e:
                print(f"  [Pia] Request failed on page {page}: {e}")
                break
        
        return events

    def _process_event_div(self, div_html: str) -> Event:
        try:
            # Re-parse the fragment
            soup = BeautifulSoup(div_html, 'html.parser')
            # The fragment is <div class="event_link">...</div>
            # BeautifulSoup adds <html><body> wrapper usually, so we find the div again
            div = soup.find('div', class_='event_link')
            if not div:
                # Fallback if the parsing behaves differently
                div = soup

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
            place_tag = div.select_one('li.is_place span[itemprop="name"]')
            venue = "Unknown Venue"
            if place_tag:
                    venue = place_tag.get_text(strip=True)
            
            region_tag = div.select_one('li.is_place span[itemprop="addressRegion"]')
            location = ""
            if region_tag:
                location = f"{region_tag.get_text(strip=True)}"

            # Artist - Scrape Detail Page
            artist = ""
            if link:
                # Sleep removed or reduced because we are in threads, but let's keep it minimal if needed.
                # Since we have max_workers=10, we are already putting load on them.
                # time.sleep(0.1) 
                artist = self._scrape_artist_from_detail(link)
            
            # Formatting checks
            if not artist:
                artist = title # Fallback to title instead of empty


            if title and link:
                return Event(
                    title=title,
                    venue=venue,
                    location=location,
                    date=date_obj or datetime.now(),
                    url=link,
                    artist=artist
                )
            return None

        except Exception as e:
            # print(f"  [Pia] Failed to parse item: {e}")
            return None

        
        return events

    def _scrape_artist_from_detail(self, url: str) -> str:
        """
        Fetches the event detail page and extracts artist info from div.Y15-event-description.
        Format: ［出演］Artist A / Artist B ...
        """
        try:
             headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
             }
             resp = requests.get(url, headers=headers, timeout=10)
             resp.encoding = 'UTF-8'
             if resp.status_code != 200:
                 return ""

             soup = BeautifulSoup(resp.text, 'html.parser')
             desc_div = soup.select_one('div.Y15-event-description')
             if desc_div:
                 # Separator \n is safer than strip=True merged
                 full_text = desc_div.get_text(separator="\n", strip=True) 
                 # Regex for ［出演］ or ［ゲスト］ (capture) until newline or end
                 match = re.search(r'［(?:出演|ゲスト)］(.*?)(?:\n|$)', full_text)
                 if match:
                     return match.group(1).strip()
             
             return ""

        except Exception as e:
             # print(f"  [Pia] Detail scrape failed for {url}: {e}")
             return ""

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # Placeholder
        return [] 
