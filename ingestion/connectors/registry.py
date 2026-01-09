from typing import Type, List
from .base import BaseConnector

CONNECTOR_REGISTRY: List[Type[BaseConnector]] = []

def register_connector(cls: Type[BaseConnector]):
    """Decorator to register a connector class."""
    CONNECTOR_REGISTRY.append(cls)
    return cls

def get_connectors() -> List[Type[BaseConnector]]:
    """Return all registered connector classes."""
    return CONNECTOR_REGISTRY
