"""Client HTTP comú: identificació honesta i reintents davant errors temporals (502, 503, timeouts)."""

import time

import httpx

USER_AGENT = "EventSelector/0.1 (agregador personal d'esdeveniments)"
RETRY_STATUS = {429, 500, 502, 503, 504}


def make_client() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": USER_AGENT}, follow_redirects=True)


def get(client: httpx.Client, url: str, *, attempts: int = 3, backoff: float = 5.0, **kwargs) -> httpx.Response:
    for attempt in range(1, attempts + 1):
        try:
            response = client.get(url, **kwargs)
            if response.status_code not in RETRY_STATUS or attempt == attempts:
                response.raise_for_status()
                return response
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == attempts:
                raise
        time.sleep(backoff * attempt)
    raise AssertionError("unreachable")
