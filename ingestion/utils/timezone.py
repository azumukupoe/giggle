from typing import Optional
from geopy.geocoders import Nominatim
from .locations import PREFECTURES_JP_TO_EN
from timezonefinder import TimezoneFinder
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

# Initialize globally to reuse
# Warning: Nominatim requires unique user_agent
# TODO: Move user_agent to config/env
_geolocator = None
_tf = None

def _get_geolocator():
    global _geolocator
    if _geolocator is None:
        _geolocator = Nominatim(user_agent="giggle_ingestion_v1")
    return _geolocator

def _get_tf():
    global _tf
    if _tf is None:
         _tf = TimezoneFinder(in_memory=True)
    return _tf

@lru_cache(maxsize=1000)
def get_timezone_from_location(location_name: str, country_code: Optional[str] = None) -> Optional[str]:
    """
    Returns timezone name (e.g. 'Asia/Tokyo') for a given location string.
    Uses caching to avoid hitting rate limits.
    """
    if not location_name:
        return None
    
    location_name = location_name.strip()

    # Country code check (fastest)
    if country_code and country_code.upper() in ["JP", "JAPAN", "JPN"]:
        return "Asia/Tokyo"

    # Pre-checks for common locations to save API calls (Optimization)
    # 47 Prefectures of Japan
    jp_prefectures = [
        "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
        "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
        "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
        "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
        "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
        "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
        "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
    ]
    # Common cities or variants
    # If country code wasn't provided, check for Japan-specific names
    english_prefectures = set(PREFECTURES_JP_TO_EN.values())
    
    if (any(p in location_name for p in jp_prefectures) or 
        location_name in english_prefectures or 
        "Japan" in location_name or 
        "Tokyo" in location_name):
        return "Asia/Tokyo"
    
    try:
        geo = _get_geolocator()
        loc = geo.geocode(location_name, timeout=10)
        if loc:
            tf = _get_tf()
            tz = tf.timezone_at(lng=loc.longitude, lat=loc.latitude)
            return tz
    except Exception as e:
        logger.warning(f"Failed to resolve timezone for {location_name}: {e}")
    
    return None

def attach_timezone(t, tz_name: str):
    """
    Attaches timezone to a naive time object.
    If t is already aware, returns it as is.
    Uses proper fixed-offset timezone to ensure valid ISO serialization for time objects.
    """
    from datetime import datetime, timezone
    import pytz
    
    if t.tzinfo is not None:
        return t
        
    try:
        # To get the correct offset, we need a reference date.
        # We use strict current local time for that timezone to determine current offset.
        # This handles DST correctly if the timezone observes it (though Asia/Tokyo doesn't).
        
        tz = pytz.timezone(tz_name)
        now = datetime.now()
        
        # Combine with today's date to get a concrete datetime
        dt = datetime.combine(now.date(), t)
        
        # Localize it to the target timezone (handles ambiguous times like fall-back)
        dt_aware = tz.localize(dt)
        
        # Extract the fixed offset (e.g., +09:00)
        offset = dt_aware.utcoffset()
        
        # Create a fixed-offset timezone info (valid for time objects)
        fixed_tz = timezone(offset)
        
        # Attach and return
        return t.replace(tzinfo=fixed_tz)
        
    except Exception as e:
        logger.warning(f"Failed to attach timezone {tz_name} to time {t}: {e}")
        return t
