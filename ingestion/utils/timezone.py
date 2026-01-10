from typing import Optional
from geopy.geocoders import Nominatim
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
def get_timezone_from_location(location_name: str) -> Optional[str]:
    """
    Returns timezone name (e.g. 'Asia/Tokyo') for a given location string.
    Uses caching to avoid hitting rate limits.
    """
    if not location_name:
        return None
    
    # Clean location name?
    location_name = location_name.strip()

    # Pre-checks for common locations to save API calls (Optimization)
    # This is a naive heuristic but effective for the specific dataset mentioned
    if any(x in location_name for x in ["Tokyo", "Japan", "Osaka", "Kyoto", "Nagoya", "Yokohama", "Sapporo", "Fukuoka"]):
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
    Note: Attaching timezone to time without date is ambiguous for DST.
    We assume standard offset or rely on downstream handling if date is known.
    Actually, pytz timezones need a date to determine offset.
    If we only have time, we can't strictly determine the offset for a named timezone like 'Asia/Tokyo' (which might change).
    However, 'Asia/Tokyo' doesn't observe DST currently.
    For 'Europe/London', 19:00 could be +00 or +01.
    
    If the database column is `timetz`, it expects an offset.
    We might need to use a dummy date (e.g. today) to resolve the offset.
    """
    from datetime import datetime, date
    import pytz
    
    if t.tzinfo is not None:
        return t
        
    try:
        tz = pytz.timezone(tz_name)
        # Use today's date to resolve offset? Or the event date?
        # Ideally event date. But here we might not have it easily if processing list of times.
        # We will assume 'today' for offset resolution if date not provided?
        # This is risky for future events.
        # Ideally, we should process constraints in the Connector where we have both.
        
        # For now, let's try to just resolve simple cases or return the timezone object itself if supported.
        # datetime.time(..., tzinfo=tz) works but might be ambiguous.
        
        # Better approach:
        # Use a reference date (e.g. current date or cheap guess).
        now = datetime.now()
        dt = datetime.combine(now.date(), t)
        dt_aware = tz.localize(dt)
        return dt_aware.timetz()
    except Exception as e:
        logger.warning(f"Failed to attach timezone {tz_name} to time {t}: {e}")
        return t
