import asyncio
import aiohttp
import time
from datetime import datetime, timedelta, timezone
from .base import BaseConnector, Event
import json
import concurrent.futures

class EplusConnector(BaseConnector):
    def __init__(self):
        super().__init__()

        self.api_url = "https://api.eplus.jp/v3/koen"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'X-APIToken': 'FGXySj3mTd' # Static token
        }

        self.sem = asyncio.Semaphore(50) 

    async def _fetch(self, session, params):
        async with self.sem:
            try:
                async with session.get(self.api_url, headers=self.headers, params=params, timeout=30) as response:
                    if response.status != 200:
                        return None
                    return await response.json()
            except Exception:
                return None

    async def _get_all_ids_async(self, session, genre_code: str):
        """
        Async fetches all (kogyo_code, kogyo_sub_code) tuples for a given parent_genre_code.
        """
        print(f"  [eplus] Fetching exclusion list for genre {genre_code}...")
        items_per_page = 200
        params = {
            "shutoku_kensu": 1,
            "shutoku_start_ichi": 1,
            "parent_genre_code_list": genre_code,
            "streaming_haishin_kubun_list": "0"
        }
        

        data = await self._fetch(session, params)
        if not data:
            return set()
            
        total_count = data['data'].get('so_kensu', 0)
        print(f"  [eplus] Genre {genre_code} has {total_count} items. Fetching all...")
        
        ids = set()
        tasks = []
        
        for start_index in range(1, total_count + 1, items_per_page):
            p = params.copy()
            p['shutoku_kensu'] = items_per_page
            p['shutoku_start_ichi'] = start_index
            tasks.append(self._fetch(session, p))
            
        results = await asyncio.gather(*tasks)
        
        for d in results:
            if d and d.get('data') and d['data'].get('record_list'):
                for item in d['data']['record_list']:
                    k_code = item.get('kogyo_code')
                    k_sub = item.get('kogyo_sub_code')
                    if k_code and k_sub:
                        ids.add((k_code, k_sub))
                        
        print(f"  [eplus] Fetched {len(ids)} exclusion IDs for genre {genre_code}.")
        return ids

    def _process_item_sync(self, item, dt_now, excluded_ids):
        """Sync processing helper"""
        try:
            k_code = item.get('kogyo_code')
            k_sub = item.get('kogyo_sub_code')
            if k_code and k_sub:
                if (k_code, k_sub) in excluded_ids:
                    return None

            kogyo = item.get('kanren_kogyo_sub', {})
            title_1 = kogyo.get('kogyo_name_1')
            title_2 = kogyo.get('kogyo_name_2')
            title = f"{title_1} {title_2}" if title_2 else (title_1 or "Unknown Event")
            
            venue_info = item.get('kanren_venue', {})
            venue_name = venue_info.get('venue_name') or "Unknown Venue"
            
            detail_path = item.get('koen_detail_url_pc')
            link = detail_path if detail_path else None
            if link and not link.startswith("http"):
                    link = f"https://eplus.jp{detail_path}"

            koenbi_term = item.get('koenbi_term', '')
            date_obj = dt_now 
            
            if koenbi_term:
                date_str = koenbi_term[:8]
                try:
                    JST = timezone(timedelta(hours=9))
                    date_obj = datetime.strptime(date_str, "%Y%m%d").replace(tzinfo=JST)
                    kaien_time = item.get('kaien_time') 
                    if kaien_time and len(kaien_time) == 4:
                        date_obj = date_obj.replace(
                            hour=int(kaien_time[:2]),
                            minute=int(kaien_time[2:])
                        )
                except ValueError:
                    pass
            
            pref_name = venue_info.get('todofuken_name')
            location = pref_name if pref_name else ""

            artist = title 
            uketsuke_list = item.get('kanren_uketsuke_koen_list', [])
            if uketsuke_list:
                    first_uketsuke = uketsuke_list[0]
                    performers = first_uketsuke.get('shutsuensha') 
                    if performers:
                        performers = performers.replace("本公演はスタンプ&ギフト対象公演です。", "")
                        performers = performers.replace("詳細はこちら /sf/streamingplus/stampgift", "")
                        performers = performers.strip()
                        if performers:
                            artist = performers

            if link:
                return Event(
                    title=title,
                    artist=artist,
                    venue=venue_name,
                    date=date_obj.date(),
                    time=date_obj.time() if item.get('kaien_time') and len(item.get('kaien_time')) == 4 else None,
                    location=location,
                    url=link
                )
            return None
        except Exception:
            return None

    async def _get_events_async(self, query: str = None, max_pages: int = None):
        all_events = []
        dt_now = datetime.now()

        async with aiohttp.ClientSession() as session:
            # 1. Fetch Exclusions concurrently
            excl_tasks = [
                self._get_all_ids_async(session, "200"),
                self._get_all_ids_async(session, "700")
            ]
            excl_results = await asyncio.gather(*excl_tasks)
            excluded_ids = set().union(*excl_results)
            print(f"  [eplus] Total excluded IDs: {len(excluded_ids)}")

            # 2. Setup main event fetch
            items_per_page = 200
            params = {
                "shutoku_kensu": items_per_page,
                "shutoku_start_ichi": 1,
                "sort_key": "koenbi,kaien_time,parent_koen_taisho_flag,kogyo_code,kogyo_sub_code",
                "parent_genre_code_list": "100", 
                "streaming_haishin_kubun_list": "0"
            }

            # Fetch first page to get count
            first_page = await self._fetch(session, params)
            if not first_page:
                print("  [eplus] Failed to fetch first page.")
                return []

            total_count = first_page['data'].get('so_kensu', 0)
            print(f"  [eplus] Total events found: {total_count}")

            # Collect tasks
            tasks = []
            

            
            # Helper to extract events from a page response dict
            def extract_from_json(d):
                events = []
                if d and d.get('data') and d['data'].get('record_list'):
                    for item in d['data']['record_list']:
                        ev = self._process_item_sync(item, dt_now, excluded_ids)
                        if ev:
                            events.append(ev)
                return events

            all_events.extend(extract_from_json(first_page))

            # Remaining pages
            for start_index in range(1 + items_per_page, total_count + 1, items_per_page):
                p = params.copy()
                p['shutoku_start_ichi'] = start_index
                tasks.append(self._fetch(session, p))

            print(f"  [eplus] Fetching {len(tasks)} remaining pages concurrently...")
            results = await asyncio.gather(*tasks)
            
            for d in results:
                all_events.extend(extract_from_json(d))

        return all_events

    def get_events(self, query: str = None, max_pages: int = None):

        
        try:
            # Check if there is already a running loop (unlikely in this architecture but safely handled)
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            return asyncio.run(self._get_events_async(query, max_pages))
        else:
            return asyncio.run(self._get_events_async(query, max_pages))

    def get_artist_events(self, artist_name: str):
        return []




