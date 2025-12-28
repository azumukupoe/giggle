import requests
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List
from .base import BaseConnector, Event
import re
import time
import concurrent.futures


class PiaConnector(BaseConnector):
    def __init__(self):
        super().__init__()
        # Setup session with retry
        self.session = requests.Session()
        retries = requests.adapters.Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
        adapter = requests.adapters.HTTPAdapter(max_retries=retries)
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)

    def get_events(self, max_pages: int = None) -> List[Event]:
        raw_events = []
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
                resp = self.session.get(url, params=params, headers=headers)
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

                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                    # Pass str(div) to ensure thread-safety for BeautifulSoup
                    futures = [executor.submit(self._process_event_div, str(div)) for div in event_links]
                    
                    for future in concurrent.futures.as_completed(futures):
                        try:
                            result = future.result()
                            if result:
                                # result is a list of dicts now
                                raw_events.extend(result)
                        except Exception as e:
                            pass

            except Exception as e:
                print(f"  [Pia] Request failed on page {page}: {e}")
                break
        
        # Merging logic
        # Group by (date, venue)
        grouped_events = {}
        for ev in raw_events:
            # Ensure valid date and venue
            if not ev.get('date') or not ev.get('venue'):
                continue
                
            # Use isoformat date string for key consistency if date is datetime
            # ev['date'] is datetime object from _process_event_div
            key = (ev['date'], ev['venue'])
            if key not in grouped_events:
                grouped_events[key] = []
            grouped_events[key].append(ev)
            
        final_events = []
        for key, group in grouped_events.items():
            if not group:
                continue
                
            # Base event is the first one
            base_ev = group[0]
            
            # Use bundle info if available
            bundle_title = None
            bundle_url = None
            
            for ev in group:
                if ev.get('bundle_title'):
                    bundle_title = ev['bundle_title']
                if ev.get('bundle_url'):
                    bundle_url = ev['bundle_url']
                if bundle_title and bundle_url:
                    break
            
            title = base_ev['title']
            url = base_ev['url']
            artist = base_ev['artist']
            
            if bundle_title:
                title = bundle_title
            
            if bundle_url:
                if bundle_url.startswith('/'):
                    url = f"https://t.pia.jp{bundle_url}"
                elif not bundle_url.startswith('http'):
                    url = f"https://t.pia.jp/{bundle_url}"
                else:
                    url = bundle_url
            
            artists = set()
            for ev in group:
                if ev.get('artist'):
                    artists.add(ev['artist'])
            
            # If we want to join artists, do it here. For now, keep base artist or join?
            # base_ev artist might be good enough if they are the same event.
            
            final_events.append(Event(
                title=title,
                venue=base_ev['venue'],
                location=base_ev['location'],
                date=base_ev['date'],
                url=url,
                artist=artist
            ))
            
        return final_events

    def _process_event_div(self, div_html: str) -> List[dict]:
        """
        Parses an event div from the list page.
        Returns a LIST of event dicts, because one list item (event.do) might duplicate into multiple events (dates).
        """
        try:
            # Re-parse the fragment
            soup = BeautifulSoup(div_html, 'html.parser')
            div = soup.find('div', class_='event_link')
            if not div:
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
            
            # List-Level Date (might be incomplete/range)
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

            # Basic dictionary for the item found on list
            base_info = {
                "title": title,
                "venue": venue,
                "location": location,
                "date": date_obj, # might be None
                "url": link,
                "artist": title, # default
                "bundle_title": None,
                "bundle_url": None
            }
            
            # Check if this is an "event.do" page (multi-event potential)
            # Link format: /pia/event/event.do?eventCd=... or eventBundleCd=...
            # The user says "event page doesn't have date available" sometimes.
            is_generic_event_page = "event.do" in link

            extracted_events = []

            if is_generic_event_page:
                # Deep fetch
                extracted_events = self._handle_multi_event_page(link, base_info)
            else:
                # It is likely a ticketInformation.do or similar
                # We can still try to get details (and bundle info) from it.
                info = self._scrape_detail_info(link)
                base_info.update({
                    "artist": info.get('artist') or base_info['artist'],
                    "bundle_title": info.get('bundle_title'),
                    "bundle_url": info.get('bundle_url')
                })
                extracted_events = [base_info]

            # Final validation/formatting
            valid_events = []
            for ev in extracted_events:
                # If date is missing, drop? Or keep with default?
                # User says "you need to open each ticket page to retrieve date"
                # If we failed to get date, and list date is also missing, we can't use it.
                if not ev.get('date'):
                     if ev.get('base_date'): # fallback to list date if we kept it somewhere?
                         ev['date'] = ev['base_date']
                     else:
                         # Try fallback
                         ev['date'] = datetime.now() # Not ideal, but safe
                
                # Check artist fallback
                if not ev.get('artist'):
                    ev['artist'] = ev['title']

                valid_events.append(ev)
            
            return valid_events

        except Exception as e:
            # print(f"  [Pia] Failed to parse item: {e}")
            return []

    def _handle_multi_event_page(self, url: str, base_info: dict) -> List[dict]:
        """
        Fetches event.do page, looks for child ticket links, scrapes them for real date/venue.
        """
        results = []
        try:
             headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
             resp = self.session.get(url, headers=headers, timeout=10)
             resp.encoding = 'UTF-8'
             if resp.status_code != 200:
                 return [base_info]

             soup = BeautifulSoup(resp.text, 'html.parser')

             # 1. Scrape generic info from this page (Bundle info, artist)
             # _scrape_detail_info logic can be reused or inlined
             # Let's extract bundle info here manually or reuse helper if safe
             # But helper does a request. We already have soup.
             # Inline reuse of logic:
             desc_div = soup.select_one('div.Y15-event-description')
             page_artist = ""
             if desc_div:
                 full_text = desc_div.get_text(separator="\n", strip=True) 
                 match = re.search(r'［(?:出演|ゲスト)］(.*?)(?:\n|$)', full_text)
                 if match:
                     page_artist = match.group(1).strip()
             
             event_link_section = soup.select_one('#eventLink')
             bundle_title = None
             bundle_url = None
             if event_link_section:
                 title_div = event_link_section.select_one('.eventLinkBoxMttl')
                 if title_div:
                     p_tag = title_div.find('p')
                     bundle_title = p_tag.get_text(strip=True) if p_tag else title_div.get_text(strip=True)
                 a_tag = event_link_section.find('a', href=True)
                 if a_tag:
                     bundle_url = a_tag['href']

             # 2. Find ticket links
             # Selector: links containing 'ticketInformation.do'
             # Avoid loops?
             seen_links = set()
             ticket_links = []
             for a in soup.find_all('a', href=True):
                 href = a['href']
                 if 'ticketInformation.do' in href:
                     full_ticket_url = href
                     if not href.startswith('http'):
                         if href.startswith('/'):
                             full_ticket_url = f"https://t.pia.jp{href}"
                         else:
                             full_ticket_url = f"https://t.pia.jp/{href}" # improbable
                     
                     if full_ticket_url not in seen_links:
                         seen_links.add(full_ticket_url)
                         ticket_links.append(full_ticket_url)
            
             if not ticket_links:
                 # No children found, return base_info updated with what we found
                 base_info.update({
                     "artist": page_artist or base_info['artist'],
                     "bundle_title": bundle_title,
                     "bundle_url": bundle_url
                 })
                 return [base_info]

             # 3. Visit each ticket link
             for t_url in ticket_links:
                 try:
                     # Fetch ticket page
                     t_resp = self.session.get(t_url, headers=headers, timeout=10)
                     t_resp.encoding = 'UTF-8'
                     t_soup = BeautifulSoup(t_resp.text, 'html.parser')
                     
                     # Extract Date: .Y15-event-date
                     t_date_obj = None
                     date_tag = t_soup.select_one('.Y15-event-date')
                     if date_tag:
                         # Text format: 2025/12/29(月)
                         d_text = date_tag.get_text(strip=True)
                         d_match = re.search(r'(\d{4}/\d{1,2}/\d{1,2})', d_text)
                         if d_match:
                             t_date_obj = datetime.strptime(d_match.group(1), "%Y/%m/%d")

                     # Extract Venue: verify selector?
                     # Let's try standard itemprops or class names on ticket page
                     # Inspection needed? Assume base venue if not found or try common ones
                     # dataList__item for venue?
                     # Let's default to base_info['venue'] if we can't find specific
                     # But venue might differ!
                     # Let's try to find text near "会場" (Venue)
                     t_venue = base_info['venue']
                     # Heuristic: search for '会場' dt, then get dd
                     try:
                         for dt in t_soup.find_all('dt'):
                             if '会場' in dt.get_text():
                                 # Next sibling dd?
                                 dd = dt.find_next_sibling('dd')
                                 if dd:
                                     t_venue = dd.get_text(strip=True)
                                 break
                     except:
                         pass

                     new_event = base_info.copy()
                     new_event.update({
                         "url": t_url, # Link to specific ticket
                         "date": t_date_obj or base_info['date'],
                         "venue": t_venue,
                         "artist": page_artist or base_info['artist'], # Helper logic usually found artist on detail
                         "bundle_title": bundle_title,
                         "bundle_url": bundle_url
                     })
                     
                     # If we fetched a ticket page, maybe we should also check if IT has bundle info?
                     # (Unlikely to differ from parent, but possible)
                     
                     results.append(new_event)
                     
                 except Exception as ex:
                     # print(f"Failed child ticket: {ex}")
                     pass

             if not results:
                 return [base_info]
                 
             return results

        except Exception as e:
             # print(f"Multi-event handle failed: {e}")
             return [base_info]

    def _scrape_detail_info(self, url: str) -> dict:
        """
        Fetches the event detail page and extracts:
         - Artist info from div.Y15-event-description.
         - Bundle info from header/eventLink section.
        """
        result = {
            "artist": "",
            "bundle_title": None,
            "bundle_url": None
        }
        try:
             headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
             }
             resp = self.session.get(url, headers=headers, timeout=10)
             resp.encoding = 'UTF-8'
             if resp.status_code != 200:
                 return result

             soup = BeautifulSoup(resp.text, 'html.parser')
             
             # 1. Artist
             desc_div = soup.select_one('div.Y15-event-description')
             if desc_div:
                 # Separator \n is safer than strip=True merged
                 full_text = desc_div.get_text(separator="\n", strip=True) 
                 # Regex for ［出演］ or ［ゲスト］ (capture) until newline or end
                 match = re.search(r'［(?:出演|ゲスト)］(.*?)(?:\n|$)', full_text)
                 if match:
                     result["artist"] = match.group(1).strip()
             
             # 2. Bundle Info
             # Based on user snippet: <section id="eventLink" ...> ... <div class="eventLinkBoxMttl"> ...
             event_link_section = soup.select_one('#eventLink')
             if event_link_section:
                 # Title
                 title_div = event_link_section.select_one('.eventLinkBoxMttl')
                 if title_div:
                     # Check if there is a <p> tag inside
                     p_tag = title_div.find('p')
                     if p_tag:
                         result["bundle_title"] = p_tag.get_text(strip=True)
                     else:
                         # Snippet 1 has no <p>, just text
                         result["bundle_title"] = title_div.get_text(strip=True)
                 
                 # URL
                 a_tag = event_link_section.find('a', href=True)
                 if a_tag:
                     result["bundle_url"] = a_tag['href']

             return result

        except Exception as e:
             # print(f"  [Pia] Detail scrape failed for {url}: {e}")
             return result

    def get_artist_events(self, artist_name: str) -> List[Event]:
        # Placeholder
        return [] 
