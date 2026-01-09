from datetime import datetime, date
from zoneinfo import ZoneInfo
from typing import TYPE_CHECKING, Union, List

# Prevent circular import if Event is imported for type checking
if TYPE_CHECKING:
    from ingestion.models import Event

def is_future_event(e: "Event") -> bool:
    dt_today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
    
    try:
        if isinstance(e.date, str):
            # Handle multiple dates separated by space (e.g. ranges "2026-01-04 2026-01-31")
            parts = e.date.split()
            if not parts:
                return True
                
            any_future = False
            parsed_count = 0
            
            for part in parts:
                try:
                    parsed_date = datetime.strptime(part[:10], '%Y-%m-%d').date()

                    parsed_count += 1
                    if parsed_date >= dt_today:
                        any_future = True
                        break
                except ValueError:
                    continue
            
            if any_future:
                return True
                
            if parsed_count > 0:
                return False
                
            # If no dates parsed, keep it (safe default)
            return True
            
        elif isinstance(e.date, (date, datetime)):

            check_date = e.date
            if isinstance(check_date, datetime):
                check_date = check_date.date()
            return check_date >= dt_today
            
        elif isinstance(e.date, list):
             for d in e.date:
                 if isinstance(d, (date, datetime)):
                     check_date = d.date() if isinstance(d, datetime) else d
                     if check_date >= dt_today:
                         return True
                 elif isinstance(d, str):
                     try:
                         parsed_date = datetime.strptime(d[:10], '%Y-%m-%d').date()
                         if parsed_date >= dt_today:
                             return True
                     except ValueError:
                         continue
             return False


    except Exception:
        # If parsing fails or unknown type, keep it to be safe
        return True
    
    return True
