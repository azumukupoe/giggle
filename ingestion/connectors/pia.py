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
        # max_pages is now treated as max pages PER PREFECTURE, default 100
        max_pages_per_pf = max_pages if max_pages else 100
        
        raw_events = []
        url = "https://t.pia.jp/pia/rlsInfo.do"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Referer": "https://t.pia.jp/pia/search_all.do"
        }

        # Iterate through prefectures 01 to 47
        for pf_code in range(1, 48):
            pf_str = f"{pf_code:02d}"
            print(f"[Pia] Scanning prefecture {pf_str}...")
            
            page = 0
            while True:
                page += 1
                if page > max_pages_per_pf:
                    print(f"  [Pia] Reached max page {max_pages_per_pf} for pf={pf_str}. Moving to next.")
                    break
                
                # Parameters based on user's successful pattern
                params = {
                    "rlsIn": "0",
                    "perfIn": "0",
                    "includeSaleEnd": "true",
                    "lg": "01", # Music
                    "pf": pf_str,
                    "page": str(page),
                    "responsive": "true",
                    "noConvert": "true",
                    "searchMode": "1",
                    "mode": "2",
                    "dispMode": "1"
                }

                try:
                    # random sleep to be polite?
                    # time.sleep(0.5) 
                    
                    resp = self.session.get(url, params=params, headers=headers)
                    resp.encoding = 'UTF-8'
                    
                    if resp.status_code != 200:
                        print(f"  [Pia] Error: Status {resp.status_code} on pf={pf_str} page={page}")
                        break

                    soup = BeautifulSoup(resp.text, 'html.parser')

                    # Check for maintenance
                    if "ただいまシステムメンテナンス中です" in soup.get_text() or "system maintenance" in soup.get_text().lower():
                        print(f"  [Pia] WARNING: System Maintenance. Stopping.")
                        return self._merge_events(raw_events)

                    event_links = soup.select('div.event_link, ul.common_list_item')
                    
                    if not event_links:
                        # No events on this page means we are done with this prefecture
                        # print(f"  [Pia] No events found on pf={pf_str} page={page}. Next prefecture.")
                        break

                    print(f"  [Pia] Found {len(event_links)} event items on pf={pf_str} page={page}.")

                    # Process items concurrently
                    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                        futures = [executor.submit(self._process_event_div, str(div)) for div in event_links]
                        
                        for future in concurrent.futures.as_completed(futures):
                            try:
                                result = future.result()
                                if result:
                                    raw_events.extend(result)
                            except Exception as e:
                                pass
                                
                except Exception as e:
                    print(f"  [Pia] Request failed on pf={pf_str} page={page}: {e}")
                    break
        
        return self._merge_events(raw_events)

    def _merge_events(self, raw_events: List[dict]) -> List[Event]:
        # Merging logic
        # Group by (date, venue)
        grouped_events = {}
        for ev in raw_events:
            # Ensure valid date and venue
            if not ev.get('date') or not ev.get('venue'):
                continue
                
            # Use isoformat date string for key consistency if date is datetime
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
            
            # Use bundle info if available from ANY in group
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
        Parses an event div OR list item from the list page.
        Returns a LIST of event dicts.
        """
        try:
            soup = BeautifulSoup(div_html, 'html.parser')
            
            # Identify if this is a "mobile-like" div or "desktop-like" list item
            # We treat 'div' as the root element passed in
            root = soup.find('div', class_='event_link')
            is_desktop = False
            
            if not root:
                # Check for desktop structure: root might be a <li> or we just search inside soup
                # If passed markup is <li>...</li>, soup.find('li') works
                root = soup.find('li', class_='listWrp_title_list')
                if root:
                     # This is just the title part of the desktop row? 
                     # Actually, usually we passed the parent container?
                     # If we passed the entire row (ul or whatever), let's find that.
                     pass 
                
                # If we are passed the whole block, let's try to detect title method
                if soup.select_one('.listWrp_title_list'):
                    is_desktop = True
                    root = soup # Treat entire snippet as root
                else:
                    root = soup # Fallback
            
            # --- TITLE & URL ---
            title = "Unknown Title"
            link = ""
            
            if is_desktop:
                # Desktop: <li class="listWrp_title_list"><a ...>Title</a></li>
                title_tag = root.select_one('.listWrp_title_list a')
                if title_tag:
                    title = title_tag.get_text(strip=True)
                    link = title_tag['href']
            else:
                # Mobile/Default
                # 1. h3.sales_data_title a
                t_tag = root.select_one('h3.sales_data_title a') 
                if t_tag:
                     title = t_tag.get_text(strip=True)
                     link = t_tag['href']
                else:
                     # 2. h3.sales_data_title text
                     t_h3 = root.select_one('h3.sales_data_title')
                     if t_h3:
                         title = t_h3.get_text(strip=True)
                     else:
                         # 3. Old fallback
                         t_li = root.select_one('li.is_title')
                         if t_li:
                             title = t_li.get_text(strip=True)

                if not link:
                    a_tag = root.find('a', href=True)
                    link = a_tag['href'] if a_tag else ""

            # Normalize Link
            if link:
                if link.startswith('/'):
                    link = f"https://t.pia.jp{link}"
                elif not link.startswith('http'):
                    link = f"https://t.pia.jp/{link}"

            # --- METADATA (Date/Venue) ---
            # Used only as fallback if deep fetch fails, OR for initial filtering?
            # Actually we rely on deep fetch. But extracting venue here is good for "base_info".
            
            venue = "Unknown Venue"
            location = ""
            date_obj = None

            if is_desktop:
                # Desktop Date: <span class="list_03">2026/2/28(土)</span>
                d_tag = root.select_one('.list_03')
                if d_tag:
                    # Clean text
                    d_text = d_tag.get_text(strip=True)
                    # Simple parse if possible, or wait for deep fetch
                    match = re.search(r'(\d{4}/\d{1,2}/\d{1,2})', d_text)
                    if match:
                        try:
                            date_obj = datetime.strptime(match.group(1), "%Y/%m/%d")
                            # Add JST
                            from datetime import timezone, timedelta
                            jst = timezone(timedelta(hours=9))
                            date_obj = date_obj.replace(tzinfo=jst)
                        except: pass

                # Desktop Venue: <span class="list_04">Venue(Loc)</span>
                v_tag = root.select_one('.list_04')
                if v_tag:
                    full_venue = v_tag.get_text(strip=True)
                    # "Venue(Loc)" -> extract
                    if '(' in full_venue and full_venue.endswith(')'):
                        venue = full_venue.split('(')[0]
                        location = full_venue.split('(')[-1].strip(')')
                    else:
                        venue = full_venue
            else:
                # Mobile
                time_tag = root.select_one('time[itemprop="startDate"]')
                if time_tag and time_tag.has_attr('datetime'):
                    try:
                        date_obj = datetime.fromisoformat(time_tag['datetime'])
                        if date_obj.tzinfo is None:
                            from datetime import timezone, timedelta
                            jst = timezone(timedelta(hours=9))
                            date_obj = date_obj.replace(tzinfo=jst)
                    except: pass
                
                place_tag = root.select_one('li.is_place span[itemprop="name"]')
                if place_tag:
                        venue = place_tag.get_text(strip=True)
                
                region_tag = root.select_one('li.is_place span[itemprop="addressRegion"]')
                if region_tag:
                    location = region_tag.get_text(strip=True)

            base_info = {
                "title": title,
                "venue": venue,
                "location": location,
                "date": date_obj,
                "url": link,
                "artist": title, 
                "bundle_title": None,
                "bundle_url": None
            }
            
            # Deep fetch
            extracted_events = self._deep_fetch_and_expand(link, base_info)
            return extracted_events

        except Exception as e:
            return []

    def _deep_fetch_and_expand(self, url: str, base_info: dict) -> List[dict]:
        """
         visits the URL (event.do or ticketInformation.do).
         - Extracts Artist / Bundle Info
         - Finds ALL dates/times.
         - If simple ticket page with one date -> 1 event.
         - If ticket page with multiple dates -> N events.
         - If event.do page -> finds child ticket links -> visits them -> N events.
        """
        results = []
        try:
             headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
             resp = self.session.get(url, headers=headers, timeout=10)
             resp.encoding = 'UTF-8'
             if resp.status_code != 200:
                 return [] # If we can't open page, we probably can't get reliable date, skip?

             soup = BeautifulSoup(resp.text, 'html.parser')

             # 1. Common Metadata (Artist, Bundle)
             # Reuse logic from before
             page_artist = ""
             bundle_title = None
             bundle_url = None
             
             # Artist
             desc_div = soup.select_one('div.Y15-event-description')
             if desc_div:
                 full_text = desc_div.get_text(separator="\n", strip=True) 
                 match = re.search(r'［(?:出演|ゲスト)］(.*?)(?:\n|$)', full_text)
                 if match:
                     page_artist = match.group(1).strip()
            
             # Bundle
             event_link_section = soup.select_one('#eventLink')
             if event_link_section:
                 title_div = event_link_section.select_one('.eventLinkBoxMttl')
                 if title_div:
                     p_tag = title_div.find('p')
                     bundle_title = p_tag.get_text(strip=True) if p_tag else title_div.get_text(strip=True)
                 a_tag_b = event_link_section.find('a', href=True)
                 if a_tag_b:
                     bundle_url = a_tag_b['href']

             # 2. Check if this is a "Container" page (event.do) with child links
             # OR a leaf page (ticketInformation.do) with dates.
             # Note: event.do might ALSO have dates directly if it's a simple event? 
             # Usually event.do has links to ticketInformation.do.
             
             child_links = []
             # Heuristic: look for ticketInformation.do links inside the content area
             # But exclude the one we are on?
             for a in soup.find_all('a', href=True):
                 href = a['href']
                 if 'ticketInformation.do' in href:
                     # Filter out self?
                     if href in url: 
                         continue
                     
                     full = href
                     if not href.startswith('http'):
                         if href.startswith('/'): full = f"https://t.pia.jp{href}"
                         else: full = f"https://t.pia.jp/{href}"
                     
                     if full not in child_links and full != url:
                         child_links.append(full)
             
             # Uniq
             child_links = list(set(child_links))

             if child_links:
                 # This is a container page. Delegate to children.
                 # We pass artist/bundle info down.
                 
                 # Optimization: If child links exist, we visit them.
                 # But if there are TOO many? User said "we don't need to scrape ... event.do pages", 
                 # but we DO need to follow links if that's where the dates are.
                 # Actually user said "start times are only available on the ... ticketInformation.do pages".
                 
                 for c_url in child_links:
                     # Recursive call? Or just fetch?
                     # Better to just call this same function, but we need to avoid infinite recursion.
                     # Since we filtered `if full != url`, it should degrade to the leaf case.
                     # We can merge base_info.
                     child_results = self._deep_fetch_and_expand(c_url, base_info)
                     # Update artist/bundle if missing
                     for res in child_results:
                         if not res['artist'] or res['artist'] == res['title']:
                             res['artist'] = page_artist or res['title']
                         if not res['bundle_title']:
                             res['bundle_title'] = bundle_title
                         if not res['bundle_url']:
                             res['bundle_url'] = bundle_url
                     results.extend(child_results)
                 
                 return results
             
             else:
                 # This is likely a leaf page (ticketInformation.do) 
                 # OR an event.do that has no children (maybe single event).
                 # We extract Dates/Times here.
                 
                 # Parsing Logic for Dates on Detail Page
                 # There can be multiple .Y15-event-date sections or just one.
                 # We need to find pairings of Date + Time + Venue if possible.
                 # The structure is often:
                 #  <div class="common_list_item"> ... <div class="Y15-event-date"> ... </div> ... </div>
                 # So we iterate over containers.
                 
                 # Let's try to find common containers.
                 # If we can't find containers, we just look for all dates.
                 
                 date_containers = soup.select('.item_list .item, .common_list_item, .ticket_list .item') 
                 # .item_list .item is common for multiple rows
                 
                 found_in_containers = False
                 
                 if date_containers:
                     for item in date_containers:
                         d_obj = self._parse_date_from_soup(item)
                         if d_obj:
                             found_in_containers = True
                             # Clone base info
                             new_ev = base_info.copy()
                             new_ev['date'] = d_obj
                             new_ev['url'] = url
                             new_ev['artist'] = page_artist or base_info['artist']
                             new_ev['bundle_title'] = bundle_title
                             new_ev['bundle_url'] = bundle_url
                             
                             # Try to find venue specific to this item
                             # item -> .place or similar?
                             # Reuse base venue if not found
                             
                             results.append(new_ev)
                             
                 if not found_in_containers:
                     # Fallball: try just searching globally for .Y15-event-date
                     # This works for single event pages
                     d_obj = self._parse_date_from_soup(soup)
                     if d_obj:
                         new_ev = base_info.copy()
                         new_ev['date'] = d_obj
                         new_ev['url'] = url
                         new_ev['artist'] = page_artist or base_info['artist']
                         new_ev['bundle_title'] = bundle_title
                         new_ev['bundle_url'] = bundle_url
                         results.append(new_ev)

                 return results

        except Exception as e:
             # print(f"Deep fetch failed: {e}")
             return []

    def _parse_date_from_soup(self, soup_element):
        try:
            date_tag = soup_element.select_one('.Y15-event-date')
            if not date_tag:
                return None
            
            d_text = date_tag.get_text(strip=True)
            match = re.search(r'(\d{4}/\d{1,2}/\d{1,2})', d_text)
            if not match:
                return None
                
            date_obj = datetime.strptime(match.group(1), "%Y/%m/%d")
            
            # Time
            time_tag = soup_element.select_one('.Y15-event-time')
            if time_tag:
                 time_text = time_tag.get_text(strip=True)
                 t_match = re.search(r'(\d{1,2}:\d{2})', time_text)
                 if t_match:
                     time_parts = t_match.group(1).split(':')
                     date_obj = date_obj.replace(hour=int(time_parts[0]), minute=int(time_parts[1]))
            
            # TZ
            from datetime import timezone, timedelta
            jst = timezone(timedelta(hours=9))
            date_obj = date_obj.replace(tzinfo=jst)
            
            return date_obj
        except:
            return None

    def get_artist_events(self, artist_name: str) -> List[Event]:
        return []
