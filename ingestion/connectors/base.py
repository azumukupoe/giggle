from abc import ABC, abstractmethod
from typing import List, Optional
from datetime import datetime, date, time
from pydantic import BaseModel, field_validator

class Event(BaseModel):
    title: str
    artist: str
    venue: str
    location: str
    date: date
    time: Optional[time]
    url: str

    @field_validator('title', 'artist', 'venue', 'location')
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
