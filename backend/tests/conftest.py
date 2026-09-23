import socket
import pytest
from app.utils.cache_utils import cache, hazard_cache

def is_online():
    try:
        # Check connection to a reliable DNS IP with 1.0s timeout
        socket.create_connection(("8.8.8.8", 53), timeout=1.0)
        return True
    except OSError:
        return False

def pytest_configure(config):
    config.addinivalue_line(
        "markers", "skip_when_offline: mark test to skip if host has no external internet connection"
    )

def pytest_runtest_setup(item):
    if "skip_when_offline" in item.keywords:
        if not is_online():
            pytest.skip("Test skipped: host is offline or external endpoints unreachable")

@pytest.fixture(autouse=True)
def clear_caches_between_tests():
    cache.clear()
    hazard_cache.clear()
    yield
    cache.clear()
    hazard_cache.clear()
