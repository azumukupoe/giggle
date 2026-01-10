
import re
from typing import List, Optional, Dict
from supabase import Client
from ingestion.utils.text import clean_text

class Standardizer:
    def __init__(self, supabase: Client):
        self.supabase = supabase
        self.location_timezones: Dict[str, str] = {} # name -> timezone
        self._load_caches()

    def _load_caches(self):
        print("  [Standardizer] Loading caches...")
        try:
            # Load locations for timezone lookup
            res = self.supabase.table("locations").select("name_ja, name_en, timezone").execute()

            for loc in res.data:
                tz = loc.get('timezone')
                if tz:
                    if loc.get('name_ja'): self.location_timezones[loc['name_ja']] = tz
                    if loc.get('name_en'): self.location_timezones[loc['name_en']] = tz
            
            print(f"  [Standardizer] Loaded timezone mappings for {len(self.location_timezones)} location names.")
        except Exception as e:
            print(f"  [Standardizer] Error loading caches: {e}")

    def get_location_names(self, raw_loc: str) -> List[str]:
        if not raw_loc:
            return []
        
        normalized = clean_text(raw_loc)
        if not normalized:
            return []

        # Split logic: slash, comma, middle dot, ampersand
        parts = re.split(r'[/\,、\・\&]', normalized)
        cleaned_parts = []
        seen = set()
        
        for p in parts:
            p = p.strip()
            if p and p not in seen:
                cleaned_parts.append(p)
                seen.add(p)
                
        return cleaned_parts

    def get_location_timezone(self, location_names: List[str]) -> Optional[str]:
        if not location_names:
             return None
        
        # Try to find a timezone for any of the location names
        for loc in location_names:
            tz = self.location_timezones.get(loc)
            if tz:
                return tz
                
        # Optional: Suffix matching logic could be added here if exact match fails
        return None

    def get_venue_names(self, raw_venue: str) -> List[str]:
        if not raw_venue:
            return []
        cleaned = clean_text(raw_venue)
        return [cleaned] if cleaned else []

    def localize_pending(self):
        # No-op since we don't do background localization anymore
        pass
