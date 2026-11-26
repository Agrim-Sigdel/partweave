from collections.abc import Mapping, Sequence

from .core import DagNode, ResolveResult, resolve_dag


class DagResolutionError(Exception):
    """Raised on unknown nodes, cycles, or conflicts."""


class DependencyPlanner:
    """Pure Transform Wrapper: plans deterministic execution/install order."""

    def __init__(self, catalog: Mapping[str, DagNode]) -> None:
        self.catalog = dict(catalog)

    def plan(self, chosen: Sequence[str]) -> ResolveResult:
        try:
            return resolve_dag(self.catalog, chosen)
        except ValueError as exc:
            raise DagResolutionError(str(exc)) from exc
