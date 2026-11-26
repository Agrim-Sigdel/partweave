# Planned modules

These designs are not implemented and are deliberately outside the selectable
`modules/` catalog: `rbac`, `rate-limit`, `audit-log`, and `workflow-engine`.
Their draft manifests are design notes, not installable modules.

To ship one, implement its templates and dependencies under `modules/<id>/`, use
the anchors in the core scaffolds, add behavioral tests to its generated apps,
and run the generated-project catalog checks. See
[authoring a module](../authoring-a-module.md) and the
[module contract](../module-contract.md).
