import pytest

from resolve_dag import DagNode, DagResolutionError, DependencyPlanner


def test_dag_closure_conflicts_and_cycles() -> None:
    cat = {
        "db": DagNode("db", provides="database"),
        "auth": DagNode("auth", requires=("db",), provides="auth"),
        "auth-alt": DagNode("auth-alt", provides="auth"),
        "app": DagNode("app", requires=("auth",)),
        "cyc1": DagNode("cyc1", requires=("cyc2",)),
        "cyc2": DagNode("cyc2", requires=("cyc1",)),
    }
    planner = DependencyPlanner(cat)
    res = planner.plan(["app"])
    assert res.order == ("db", "auth", "app")
    assert res.auto_added == ("auth", "db")

    for bad in (["auth", "auth-alt"], ["cyc1"], ["missing"]):
        with pytest.raises(DagResolutionError):
            planner.plan(bad)
