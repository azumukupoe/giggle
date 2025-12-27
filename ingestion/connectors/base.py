from abc import ABC, abstractmethod
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

class Event(BaseModel):
    title: str
    artist: str
    venue: str
    location: str
    date: datetime
    url: str

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
