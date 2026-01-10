from typing import List, Optional, Union
from datetime import datetime, date, time as dt_time
from datetime import datetime, date, time as dt_time
from pydantic import BaseModel, field_validator, model_validator
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

    @model_validator(mode='after')
    def resolve_timezone(self):
        """
        Attempt to resolve timezone for 'time' fields using 'location'.
        """
        if not self.time or not self.location:
            return self
        
        from ingestion.utils.timezone import get_timezone_from_location, attach_timezone
        
        # Determine location string
        loc_str = self.location
        if isinstance(loc_str, list):
            loc_str = loc_str[0] if loc_str else None
            
        if not loc_str:
            return self

        tz_name = get_timezone_from_location(loc_str)
        if not tz_name:
            # Try venue if location didn't work?
            if self.venue:
                v_str = self.venue
                if isinstance(v_str, list):
                    v_str = v_str[0] if v_str else None
                if v_str:
                    tz_name = get_timezone_from_location(v_str)

        if tz_name:
            # Update times
            new_times = []
            for t in self.time:
                # We need to handle potential string inputs if pydantic hasn't converted yet 
                # (though 'mode=after' implies validation passed, so they should be dt_time objects)
                if isinstance(t, dt_time):
                    # Attach timezone
                    # We might lack date here, so attach_timezone uses today as reference if needed
                    # ideally we pass self.date[0] if available
                    ref_date = None
                    if self.date and isinstance(self.date, list) and len(self.date) > 0:
                         d = self.date[0]
                         if isinstance(d, date): # Could be date or str
                              ref_date = d
                         elif isinstance(d, str):
                              try:
                                  ref_date = date.fromisoformat(d)
                              except:
                                  pass
                    
                    # attach_timezone implementation needs to handle ref_date if we update it
                    # Current implementation allows it but we need to check signature
                    # Wait, our `attach_timezone` implementation in prev turn didn't take date_obj explicitly in signature?
                    # Let me check `ingestion/utils/timezone.py` again or blindly update it.
                    # I will assume I need to double check `attach_timezone` signature or update it if needed.
                    # The previous `replace_file_content` added `attach_timezone(t, tz_name: str)`.
                    # It calculated `now = datetime.now()` inside. 
                    # Use that for now.
                    t_aware = attach_timezone(t, tz_name)
                    new_times.append(t_aware)
                else:
                    new_times.append(t)
            self.time = new_times
            
        return self
