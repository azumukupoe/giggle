from abc import ABC, abstractmethod
from typing import List, Optional
import unicodedata
from datetime import datetime, date, time
from pydantic import BaseModel, field_validator
import html

class Event(BaseModel):
    event: str
    ticket: Optional[str] = None
    performer: Optional[str] = None
    date: date
    time: Optional[time]
    venue: str
    location: str
    url: str

    @field_validator('event', 'performer', 'venue', 'location', 'ticket')
    @classmethod
    def clean_text(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        # NFKC normalizes full-width to half-width (e.g. Ｚｅｐｐ -> Zepp)
        # Also unescape HTML entities (e.g. &amp; -> &)
        normalized = unicodedata.normalize('NFKC', v).strip().replace('\xa0', ' ')
        return html.unescape(normalized)

class BaseConnector(ABC):
    def __init__(self):
        pass

    @abstractmethod
    def get_events(self, query: str = None) -> List[Event]:
        """Fetch events based on a general query (e.g. location or keyword)"""
        pass

    @abstractmethod
    def get_artist_events(self, artist_name: str) -> List[Event]:
        """Fetch events for a specific artist"""
        pass
