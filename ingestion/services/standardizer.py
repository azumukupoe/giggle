
import os
import time
import re
import uuid
import threading
from typing import List, Optional, Tuple, Dict
from supabase import Client
import googlemaps
from ingestion.utils.text import clean_text
from ingestion.utils.config import GOOGLE_MAPS_API_KEY

class Standardizer:
    def __init__(self, supabase: Client):
        self.supabase = supabase
        self.locations_ja: Dict[str, str] = {} # name_ja -> uuid
        self.locations_en: Dict[str, str] = {} # name_en -> uuid
        self.venues_map: Dict[str, str] = {} # name -> uuid
        
        # Queue for background localization: (id, type, name, context) 
        # type='venue' or 'location'
        self.pending_localization: List[Tuple[str, str, str, Optional[str]]] = []
        
        self.lock = threading.Lock()

        # Initialize Google Maps
        self.api_key = GOOGLE_MAPS_API_KEY
        if not self.api_key:
             print("  [Standardizer] WARNING: GOOGLE_MAPS_API_KEY not found. Geocoding will be skipped.")
             self.gmaps = None
        else:
             self.gmaps = googlemaps.Client(key=self.api_key)
        
        self._load_caches()

    def _load_caches(self):
        print("  [Standardizer] Loading caches...")
        try:
            self.locations_timezone: Dict[str, str] = {} # uuid -> timezone

            res = self.supabase.table("locations").select("id, name_ja, name_en, timezone").execute()

            for loc in res.data:
                lid = loc['id']
                if loc['name_ja']: self.locations_ja[loc['name_ja']] = lid
                if loc['name_en']: self.locations_en[loc['name_en']] = lid
                if loc.get('timezone'): self.locations_timezone[lid] = loc['timezone']
            
            res_v = self.supabase.table("venues").select("id, name_ja, name_en, variation").execute()

            for v in res_v.data:
                vid = v['id']

                if v.get('name_ja'): self.venues_map[clean_text(v['name_ja'])] = vid
                if v.get('name_en'): self.venues_map[clean_text(v['name_en'])] = vid
                if v.get('variation'):
                    for var in v['variation']:
                        self.venues_map[clean_text(var)] = vid
                
            print(f"  [Standardizer] Loaded {len(self.locations_ja)} JA locations, {len(self.locations_en)} EN locations and {len(self.venues_map)//1 if self.venues_map else 0} venues (approx).")
        except Exception as e:
            print(f"  [Standardizer] Error loading caches: {e}")



    def is_uuid(self, val: str) -> bool:
        if not val: return False
        # Simple regex for UUID (loose)
        return bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', val.lower()))

    def get_location_codes(self, raw_loc: str, match_lang: str = 'ja') -> Optional[List[str]]:
        if not raw_loc:
            return None
        
        potential_ids = [p.strip() for p in raw_loc.split(',')]

        if all(self.is_uuid(pid) for pid in potential_ids if pid):
             return potential_ids # Already good list

        normalized = clean_text(raw_loc)
        
        # Split logic: slash, comma, middle dot, ampersand
        parts = re.split(r'[/\,、\・\&]', normalized)
        parts = [p.strip() for p in parts if p.strip()]
        
        founded_ids = []
        seen_ids = set()
        
        for part in parts:
            lid = None
            
            lid = self.locations_ja.get(part)

            if not lid:
                lid = self.locations_en.get(part)
            
            # Suffix matching (mostly for JA input, but harmless to try if part looks like it needs it)
            if not lid:
                 suffixes = ['都', '道', '府', '県']
                 for s in suffixes:
                     if part.endswith(s):
                         trimmed = part[:-1]
                         lid = self.locations_ja.get(trimmed)
                         if lid: break
                     else:
                         # Try adding suffix? 
                         with_s = part + s
                         lid = self.locations_ja.get(with_s)
                         if lid: break
            
            if lid and lid not in seen_ids:
                founded_ids.append(lid)
                seen_ids.add(lid)
        
        if not founded_ids:
            return None
        return founded_ids

    def get_location_timezone(self, location_id: str) -> Optional[str]:
        if not location_id:
             return None
        
        target_id = location_id
        if isinstance(location_id, list):
             if not location_id: return None
             target_id = location_id[0]
        
        return self.locations_timezone.get(target_id)

    def get_venue_code(self, raw_venue: str, context_location: str = None) -> Optional[str]:
        if not raw_venue:
            return None
            
        if self.is_uuid(raw_venue):
            return raw_venue

        normalized = clean_text(raw_venue)
        
        vid = self.venues_map.get(normalized)
        if not vid:
            vid = self._create_placeholder(normalized, "venue", context=context_location)
        
        return vid

    def _create_placeholder(self, name: str, item_type: str, context: str = None) -> str:
        with self.lock:
            # Check again inside lock in case another thread created it
            if item_type == "venue" and name in self.venues_map:
                return self.venues_map[name]

            # Create a new entry immediately to get an ID
            new_id = str(uuid.uuid4())
            
            # Optimistic update to map
            if item_type == "venue":
                self.venues_map[name] = new_id
                # DB Insert
                try:
                    self.supabase.table("venues").insert({"id": new_id, "variation": [name]}).execute()
                    print(f"  [Standardizer] Created new venue: {name}")
                    self.pending_localization.append((new_id, "venue", name, context))
                except Exception as e:
                    print(f"  [Standardizer] Error creating venue {name}: {e}")
                    
            elif item_type == "location":
                # Locations are pre-seeded. We do not create new ones.
                return None

            return new_id

    def localize_pending(self):
        """
        Process the pending localization queue. Safe to run at end of ingestion.
        """
        if not self.pending_localization:
            return

        print(f"  [Standardizer] Starting localization for {len(self.pending_localization)} items...")
        
        count = 0
        for item_id, item_type, name, context in self.pending_localization:
            # Only venues should end up here now
            if item_type != 'venue':
                continue

            # Rate limit?
            # time.sleep(0.1) 
            
            context_str = f"{context} music" if context else "music"

            search_query = f"{name} {context_str}"
            
            try:
                g_data = self._fetch_google(search_query)
                if g_data:
                    self._update_item_with_google(item_id, item_type, g_data)
                    count += 1
                else:
                    print(f"    -> No Google data for '{search_query}'")
            except Exception as e:
                print(f"    -> Error localizing {name}: {e}")
                
        print(f"  [Standardizer] Localized {count}/{len(self.pending_localization)} items.")
        self.pending_localization.clear()

    def _fetch_google(self, query: str) -> Optional[dict]:
        if not self.gmaps:
            return None
        try:
            # Use Places Text Search to find venue/location
            resp = self.gmaps.places(query, region='jp', language='ja')
            if resp.get('status') == 'OK' and resp.get('results'):
                return resp['results'][0]
            return None
        except Exception:
            return None

    def _fetch_google_details(self, place_id: str, language: str = 'en') -> Optional[dict]:
        if not self.gmaps:
            return None
        try:
            # Fetch Place Details (specifically for name in target language)
            resp = self.gmaps.place(place_id, language=language, fields=['name'])
            if resp.get('status') == 'OK' and resp.get('result'):
                return resp['result']
            return None
        except Exception:
            return None

    def _update_item_with_google(self, item_id: str, item_type: str, data: dict):
        if item_type != 'venue':
            return

        # Data is a Place result
        extracted = {}
        
        if 'name' in data:
            extracted['name_ja'] = data['name']
        
        g_pid = data.get('place_id')
        if g_pid:
            extracted['place_id'] = g_pid
            
            en_data = self._fetch_google_details(g_pid, language='en')

            if en_data and 'name' in en_data:
                extracted['name_en'] = en_data['name']

        if 'types' in data:
            extracted['type'] = data['types']
        
        # --- Duplicate Check & Merge Logic ---
        existing = self.supabase.table("venues").select("id, variation").eq("place_id", g_pid).neq("id", item_id).execute()

        
        if existing.data:
            # MERGE TARGET FOUND
            target = existing.data[0]
            target_id = target['id']
            print(f"    -> [Merge] Match found! Place ID {g_pid} belongs to venue {target_id}. Merging {item_id} into it.")

            # Identify duplicate name - check variations of the duplicate item
            dup_res = self.supabase.table("venues").select("variation").eq("id", item_id).execute()
            if dup_res.data:
                dup_vars = dup_res.data[0].get('variation') or []
                
                # Add to target variations
                current_vars = target.get('variation') or []
                changed = False
                for d_var in dup_vars:
                    if d_var and d_var not in current_vars:
                        current_vars.append(d_var)
                        changed = True
                
                if changed:
                    self.supabase.table("venues").update({"variation": current_vars}).eq("id", target_id).execute()
                    print(f"    -> Merged variations from {item_id} to {target_id}")

            # Update EVENTS that pointed to item_id to point to target_id
            self.supabase.table("events").update({"venue": target_id}).eq("venue", item_id).execute()
            print(f"    -> Updated events for venue {item_id} to {target_id}")

            # DELETE the duplicate venue
            self.supabase.table("venues").delete().eq("id", item_id).execute()
            print(f"    -> Deleted temporary venue {item_id}")
            
        else:
            # NO DUPLICATE - Update normally
            self.supabase.table("venues").update(extracted).eq("id", item_id).execute()
            print(f"    -> Updated venue {item_id} with Google data ({extracted.get('name_ja')}).")
