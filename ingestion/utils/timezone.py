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
def get_timezone_from_location(
    location_name: str, country_code: Optional[str] = None
) -> Optional[str]:
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
        "北海道",
        "青森県",
        "岩手県",
        "宮城県",
        "秋田県",
        "山形県",
        "福島県",
        "茨城県",
        "栃木県",
        "群馬県",
        "埼玉県",
        "千葉県",
        "東京都",
        "神奈川県",
        "新潟県",
        "富山県",
        "石川県",
        "福井県",
        "山梨県",
        "長野県",
        "岐阜県",
        "静岡県",
        "愛知県",
        "三重県",
        "滋賀県",
        "京都府",
        "大阪府",
        "兵庫県",
        "奈良県",
        "和歌山県",
        "鳥取県",
        "島根県",
        "岡山県",
        "広島県",
        "山口県",
        "徳島県",
        "香川県",
        "愛媛県",
        "高知県",
        "福岡県",
        "佐賀県",
        "長崎県",
        "熊本県",
        "大分県",
        "宮崎県",
        "鹿児島県",
        "沖縄県",
    ]
    # Common cities or variants
    # If country code wasn't provided, check for Japan-specific names
    english_prefectures = set(PREFECTURES_JP_TO_EN.values())

    if (
        any(p in location_name for p in jp_prefectures)
        or location_name in english_prefectures
        or "Japan" in location_name
        or "Tokyo" in location_name
    ):
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


def attach_timezone(t, tz_name: str, reference_date=None):
    """
    Attaches timezone to a naive time object.
    If t is already aware, returns it as is.
    Uses proper fixed-offset timezone to ensure valid ISO serialization for time objects.

    Args:
        t: A time object (naive or aware)
        tz_name: Timezone name (e.g., 'Asia/Tokyo')
        reference_date: Optional date to use for DST calculation. If None, uses today.
    """
    from datetime import datetime, timezone, date, time as dt_time
    from zoneinfo import ZoneInfo

    if t.tzinfo is not None:
        return t

    try:
        resolved_tz = ZoneInfo(tz_name)

        # Use reference_date if provided, otherwise use today
        if reference_date is None:
            ref_date = datetime.now().date()
        elif isinstance(reference_date, str):
            try:
                ref_date = datetime.strptime(reference_date, "%Y-%m-%d").date()
            except ValueError:
                ref_date = datetime.now().date()
        else:
            ref_date = reference_date

        # Combine with reference date to get a concrete datetime
        dt = datetime.combine(ref_date, t)
        dt_aware = dt.replace(tzinfo=resolved_tz)

        # Extract the fixed offset (e.g., +09:00)
        offset = resolved_tz.utcoffset(dt_aware)
        if offset:
            fixed_tz = timezone(offset)
            return t.replace(tzinfo=fixed_tz)
        else:
            return t.replace(tzinfo=resolved_tz)

    except Exception as e:
        logger.warning(f"Failed to attach timezone {tz_name} to time {t}: {e}")
        return t


def resolve_timezone_for_country(country: Optional[str]) -> Optional[str]:
    """
    Resolve timezone from country name or code using pytz.
    Returns timezone name or None.
    """
    if not country:
        return None

    import pytz

    # Normalize common country names to codes
    country_upper = country.upper()
    if country_upper in ["JAPAN", "JP", "JPN"]:
        return "Asia/Tokyo"

    # Try pytz country_timezones lookup
    try:
        country_tzs = pytz.country_timezones.get(country_upper)
        if country_tzs:
            return country_tzs[0]
    except Exception:
        pass

    return None


def apply_timezone_to_event_times(
    times: list, tz_name: str, reference_date=None
) -> list:
    """
    Apply timezone to a list of time objects.

    Args:
        times: List of time objects
        tz_name: Timezone name (e.g., 'Asia/Tokyo')
        reference_date: Optional reference date for DST calculation

    Returns:
        List of timezone-aware time objects
    """
    if not times or not tz_name:
        return times

    new_times = []
    for t in times:
        new_times.append(attach_timezone(t, tz_name, reference_date))
    return new_times
