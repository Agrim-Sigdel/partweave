predicate IsTopologicalOrder(order: seq<string>, deps: map<string, set<string>>)
{
  (forall i, j :: 0 <= i < j < |order| ==> order[i] != order[j]) &&
  (forall j :: 0 <= j < |order| && order[j] in deps ==>
    forall d :: d in deps[order[j]] ==> exists i :: 0 <= i < j && order[i] == d)
}
