from abc import ABC, abstractmethod
from typing import List, Optional
import unicodedata
from datetime import datetime, date, time
from zoneinfo import ZoneInfo
from pydantic import BaseModel, field_validator
import html

class Event(BaseModel):
    event: str
    ticket: Optional[str] = None
    performer: Optional[str] = None
    date: date | str
    time: Optional[time]
    venue: Optional[str] = None
    location: Optional[str] = None
    url: str

    @field_validator('event', 'performer', 'venue', 'location', 'ticket', mode='before')
    @classmethod
    def clean_text(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        # Normalize full-width to half-width and unescape HTML
        normalized = unicodedata.normalize('NFKC', v).strip().replace('\xa0', ' ')
        cleaned = html.unescape(normalized)
        return cleaned if cleaned else None

class BaseConnector(ABC):
    def __init__(self):
        pass

    @abstractmethod
    def get_events(self, query: str = None) -> List[Event]:
        """Fetch events by query"""
        pass



class CONSTANTS:
    USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

def is_future_event(e: Event) -> bool:

    dt_today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
    
    try:
        if isinstance(e.date, str):
            # Handle multiple dates separated by space (e.g. ranges "2026-01-04 2026-01-31")
            parts = e.date.split()
            if not parts:
                return True
                
            any_future = False
            parsed_count = 0
            
            for part in parts:
                # Try to parse simple YYYY-MM-DD
                try:
                    parsed_date = datetime.strptime(part[:10], '%Y-%m-%d').date()
                    parsed_count += 1
                    if parsed_date >= dt_today:
                        any_future = True
                        break
                except ValueError:
                    continue
            
            if any_future:
                return True
                
            if parsed_count > 0:
                return False
                
            # If no dates parsed, keep it (safe default)
            return True
            
        elif isinstance(e.date, (date, datetime)):

            check_date = e.date
            if isinstance(check_date, datetime):
                check_date = check_date.date()
            return check_date >= dt_today
            
    except Exception:
        # If parsing fails or unknown type, keep it to be safe
        return True
    
    return True
