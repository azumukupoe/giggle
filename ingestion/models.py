from typing import List, Optional, Union
from datetime import datetime, date, time as dt_time
from pydantic import BaseModel, field_validator
from ingestion.utils.text import clean_text

class Event(BaseModel):
    event: Optional[Union[str, List[str]]] = None
    ticket: Optional[Union[str, List[str]]] = None
    performer: Optional[Union[str, List[str]]] = None
    date: Optional[Union[date, str, List[str], List[date]]] = None
    time: Optional[List[dt_time]] = None
    venue: Optional[Union[str, List[str]]] = None
    location: Optional[Union[str, List[str]]] = None
    image: Optional[Union[str, List[str]]] = None
    url: str
    metadata: Optional[dict] = None
    
    @field_validator('event', 'performer', 'venue', 'location', 'ticket', 'image', mode='before')
    @classmethod
    def validate_text(cls, v: Optional[Union[str, List[str]]]) -> Optional[Union[str, List[str]]]:
        if isinstance(v, list):
            # deduplicate while preserving order
            seen = set()
            cleaned = []
            for i in v:
                c = clean_text(i)
                if c and c not in seen:
                    seen.add(c)
                    cleaned.append(c)
            return cleaned
        return clean_text(v)

    @field_validator('date', mode='before')
    @classmethod
    def validate_date(cls, v: Optional[Union[date, str, List[str], List[date]]]) -> Optional[Union[date, str, List[str], List[date]]]:
        if isinstance(v, list):
            # deduplicate while preserving order
            seen = set()
            deduped = []
            for i in v:
                if i not in seen:
                    seen.add(i)
                    deduped.append(i)
            return deduped
        return v

    @field_validator('time', mode='before')
    @classmethod
    def validate_time(cls, v: Optional[Union[dt_time, str, List[dt_time], List[str]]]) -> Optional[List[dt_time]]:
        if v is None:
            return None
        if not isinstance(v, list):
            v = [v]
        
        # We don't implement strict parsing here as pydantic handles it, 
        # but we ensure it's a list.
        return v
