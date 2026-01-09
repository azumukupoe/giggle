from abc import ABC, abstractmethod
from typing import List
from ingestion.models import Event

class BaseConnector(ABC):
    def __init__(self):
        pass

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Return the name of the source (e.g. 'Songkick')"""
        pass

    @abstractmethod
    def get_events(self, query: str = None) -> List[Event]:
        """Fetch events by query"""
        pass
