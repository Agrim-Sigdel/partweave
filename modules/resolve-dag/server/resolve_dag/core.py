from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class DagNode:
    id: str
    requires: tuple[str, ...] = ()
    conflicts: tuple[str, ...] = ()
    provides: str | None = None


@dataclass(frozen=True)
class ResolveResult:
    order: tuple[str, ...]
    auto_added: tuple[str, ...]


def resolve_dag(catalog: Mapping[str, DagNode], chosen: Sequence[str]) -> ResolveResult:
    requested = set(chosen)
    resolved: set[str] = set()
    auto_added: set[str] = set()

    def visit(node_id: str, stack: list[str]) -> None:
        if node_id in resolved:
            return
        if node_id in stack:
            raise ValueError(f"Cycle detected: {' -> '.join([*stack, node_id])}")
        if node_id not in catalog:
            raise ValueError(f"Unknown node '{node_id}'")
        for dep in catalog[node_id].requires:
            if dep not in requested:
                auto_added.add(dep)
            visit(dep, [*stack, node_id])
        resolved.add(node_id)

    for item in chosen:
        visit(item, [])

    provided: dict[str, str] = {}
    for node_id in sorted(resolved):
        node = catalog[node_id]
        for conflict in node.conflicts:
            if conflict in resolved:
                raise ValueError(f"Conflict between '{node_id}' and '{conflict}'")
        if node.provides:
            other = provided.get(node.provides)
            if other and other != node_id:
                raise ValueError(
                    f"Duplicate capability '{node.provides}': '{other}' vs '{node_id}'"
                )
            provided[node.provides] = node_id

    indegree = {
        nid: len([d for d in catalog[nid].requires if d in resolved])
        for nid in resolved
    }
    dependents: dict[str, list[str]] = {nid: [] for nid in resolved}
    for nid in resolved:
        for dep in catalog[nid].requires:
            dependents[dep].append(nid)

    ready = sorted(nid for nid, deg in indegree.items() if deg == 0)
    order: list[str] = []
    while ready:
        cur = ready.pop(0)
        order.append(cur)
        for nxt in dependents[cur]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
                ready.sort()

    return ResolveResult(order=tuple(order), auto_added=tuple(sorted(auto_added)))
