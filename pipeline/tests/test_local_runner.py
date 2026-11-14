"""Fonts que només es poden llegir des del PC de casa (config.runner = "local"), com l'Agenda de Barcelona, que
bloqueja els servidors de GitHub: GitHub Actions les salta i les llegeix la tasca programada de Windows."""

from event_pipeline import run
from event_pipeline.sources import SEED_SOURCES

LOCAL = {"name": "Agenda BCN", "config": {"adapter": "bcn", "runner": "local"}}
CLOUD = {"name": "Agenda Cultural", "config": {"adapter": "gencat"}}


def test_github_actions_skips_local_sources(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    assert run.runnable_here([LOCAL, CLOUD]) == [CLOUD]


def test_the_home_pc_runs_everything(monkeypatch):
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    assert run.runnable_here([LOCAL, CLOUD]) == [LOCAL, CLOUD]


def test_barcelona_agenda_seed_is_local():
    [bcn] = [s for s in SEED_SOURCES if s["config"]["adapter"] == "bcn"]
    assert bcn["config"]["runner"] == "local"
