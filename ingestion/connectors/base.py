from abc import ABC, abstractmethod
from typing import List, Optional
from datetime import datetime, date, time
from pydantic import BaseModel, field_validator

class Event(BaseModel):
    event: str
    ticket: Optional[str] = None
    performer: str
    date: date
    time: Optional[time]
    venue: str
    location: str
    url: str

    @field_validator('event', 'performer', 'venue', 'location', 'ticket')
    @classmethod
    def clean_text(cls, v: str) -> str:
        if not v:
            return v
        return v.replace('\xa0', ' ').strip()

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
