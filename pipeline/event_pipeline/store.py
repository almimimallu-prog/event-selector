"""Accés a Supabase via PostgREST (sense SDK) amb la clau secreta del pipeline."""

import httpx

from . import http


class Store:
    def __init__(self, client: httpx.Client, url: str, key: str):
        self.client = client
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):  # claus antigues (JWT): també cal la capçalera Authorization
            self.headers["Authorization"] = f"Bearer {key}"

    def _check(self, response: httpx.Response) -> httpx.Response:
        if response.status_code >= 400:
            raise RuntimeError(f"Supabase {response.status_code}: {response.text[:400]}")
        return response

    def select(self, table: str, **params: str) -> list[dict]:
        return http.get(self.client, f"{self.base}/{table}", params=params, headers=self.headers, timeout=60).json()

    def insert(self, table: str, rows: dict | list[dict], on_conflict: str | None = None) -> list[dict]:
        headers = {**self.headers, "Prefer": "return=representation"}
        params = {}
        if on_conflict:
            headers["Prefer"] += ",resolution=merge-duplicates"
            params["on_conflict"] = on_conflict
        response = self.client.post(f"{self.base}/{table}", json=rows, params=params, headers=headers, timeout=60)
        return self._check(response).json()

    def update(self, table: str, values: dict, **filters: str) -> None:
        self._check(self.client.patch(f"{self.base}/{table}", json=values, params=filters,
                                      headers=self.headers, timeout=60))

    def rpc(self, function: str, args: dict, timeout: float = 300):
        response = self.client.post(f"{self.base}/rpc/{function}", json=args, headers=self.headers, timeout=timeout)
        return self._check(response).json()
