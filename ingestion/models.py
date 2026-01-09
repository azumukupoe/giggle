from typing import List, Optional, Union
from datetime import datetime, date, time
from pydantic import BaseModel, field_validator
from ingestion.utils.text import clean_text

class Event(BaseModel):
    event: Optional[Union[str, List[str]]] = None
    ticket: Optional[Union[str, List[str]]] = None
    performer: Optional[Union[str, List[str]]] = None
    date: Optional[Union[date, str, List[str], List[date]]] = None
    time: Optional[time]
    venue: Optional[str] = None
    location: Optional[Union[str, List[str]]] = None
    image: Optional[Union[str, List[str]]] = None
    url: str
    metadata: Optional[dict] = None
    
    @field_validator('event', 'performer', 'venue', 'location', 'ticket', 'image', mode='before')
    @classmethod
    def validate_text(cls, v: Optional[Union[str, List[str]]]) -> Optional[Union[str, List[str]]]:
        if isinstance(v, list):
            cleaned = [clean_text(i) for i in v]
            return [x for x in cleaned if x]
        return clean_text(v)
