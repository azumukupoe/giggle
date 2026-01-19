from typing import List, Optional, Union
from datetime import datetime, date, time as dt_time
from pydantic import BaseModel, field_validator, model_validator
from ingestion.utils.text import clean_text
from ingestion.utils.locations import normalize_to_romanized_prefecture


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

    @field_validator(
        "event", "performer", "venue", "location", "ticket", "image", mode="before"
    )
    @classmethod
    def validate_text(
        cls, v: Optional[Union[str, List[str]]]
    ) -> Optional[Union[str, List[str]]]:
        if isinstance(v, list):
            # deduplicate while preserving order
            seen = set()
            cleaned = []
            for i in v:
                c = clean_text(i)
                if c and c not in seen:
                    seen.add(c)
                    cleaned.append(c)
            return cleaned if cleaned else None
        return clean_text(v)

    @field_validator("location", mode="after")
    @classmethod
    def normalize_location(
        cls, v: Optional[Union[str, List[str]]]
    ) -> Optional[Union[str, List[str]]]:
        if not v:
            return v

        if isinstance(v, list):
            return [normalize_to_romanized_prefecture(x) for x in v]
        return normalize_to_romanized_prefecture(v)

    @field_validator("date", mode="before")
    @classmethod
    def validate_date(
        cls, v: Optional[Union[date, str, List[str], List[date]]]
    ) -> Optional[Union[date, str, List[str], List[date]]]:
        if isinstance(v, list):
            # deduplicate while preserving order
            seen = set()
            deduped = []
            for i in v:
                if i not in seen:
                    seen.add(i)
                    deduped.append(i)
            return deduped if deduped else None
        return v

    @field_validator("time", mode="before")
    @classmethod
    def validate_time(
        cls, v: Optional[Union[dt_time, str, List[dt_time], List[str]]]
    ) -> Optional[List[dt_time]]:
        if v is None:
            return None
        if not isinstance(v, list):
            v = [v]

        # We don't implement strict parsing here as pydantic handles it,
        # but we ensure it's a list.
        return v if v else None

    @model_validator(mode="after")
    def resolve_timezone(self):
        """
        Attempt to resolve timezone for 'time' fields using 'location'.
        """
        if not self.time or not self.location:
            return self

        from ingestion.utils.timezone import (
            get_timezone_from_location,
            apply_timezone_to_event_times,
        )

        # Determine location string
        loc_str = self.location[0] if isinstance(self.location, list) else self.location
        if not loc_str:
            return self

        country = self.metadata.get("country") if self.metadata else None
        tz_name = get_timezone_from_location(loc_str, country_code=country)

        # Try venue if location didn't work
        if not tz_name and self.venue:
            v_str = self.venue[0] if isinstance(self.venue, list) else self.venue
            if v_str:
                tz_name = get_timezone_from_location(v_str)

        if tz_name:
            # Get reference date for DST calculation
            ref_date = None
            if self.date and isinstance(self.date, list) and self.date:
                ref_date = self.date[0]
            elif isinstance(self.date, (date, str)):
                ref_date = self.date

            self.time = apply_timezone_to_event_times(self.time, tz_name, ref_date)

        return self
