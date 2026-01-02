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
    """
    Check if event is in the future.
    """
    dt_today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
    
    try:
        if isinstance(e.date, str):
            # Try to parse simple YYYY-MM-DD
            parsed_date = datetime.strptime(e.date[:10], '%Y-%m-%d').date()
            return parsed_date >= dt_today
        elif isinstance(e.date, (date, datetime)):
            return e.date >= dt_today
    except Exception:
        # If parsing fails or unknown type, keep it to be safe (or drop? Logic says keep in main.py)
        # implementation_plan said "Refactor ... block ... to use new utility".
        # main.py logic was "Unknown type, keep it just in case".
        return True
    
    return True
