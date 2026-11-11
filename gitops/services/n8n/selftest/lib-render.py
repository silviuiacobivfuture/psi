#!/usr/bin/env python3
"""Read what kustomize RENDERED, so a harness judges the manifest and not a copy of it.

  lib-render.py env <render.yaml> <deployment> <container>   KEY=VALUE per line
  lib-render.py image <render.yaml> <deployment> <container> the image reference
  lib-render.py aliases <render.yaml> <deployment>           the hostAliases names

Stdlib only, so it needs nothing installed: the render is converted to JSON by
`kubectl create --dry-run=client -o json` before it gets here: JSON objects in a row.
Env entries that reference a Secret or a ConfigMap are skipped, and `$(VAR)` is left
for the caller, who supplies those values.
"""
import json
import sys


def objects(path):
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    decoder = json.JSONDecoder()
    found, pos = [], 0
    while pos < len(text):
        while pos < len(text) and text[pos].isspace():
            pos += 1
        if pos == len(text):
            break
        obj, pos = decoder.raw_decode(text, pos)
        found.extend(obj["items"] if obj.get("kind") == "List" else [obj])
    return found


def deployment(path, name):
    for obj in objects(path):
        if obj.get("kind") == "Deployment" and obj["metadata"]["name"] == name:
            return obj
    sys.exit(f"no Deployment {name} in {path}")


def container(dep, name):
    for item in dep["spec"]["template"]["spec"]["containers"]:
        if item["name"] == name:
            return item
    sys.exit(f"no container {name}")


def main():
    verb, path, dep_name = sys.argv[1:4]
    dep = deployment(path, dep_name)
    if verb == "aliases":
        for alias in dep["spec"]["template"]["spec"].get("hostAliases", []):
            print("\n".join(alias["hostnames"]))
        return
    item = container(dep, sys.argv[4])
    if verb == "image":
        print(item["image"])
    elif verb == "env":
        for env in item.get("env", []):
            if "value" in env or "valueFrom" not in env:
                print(f"{env['name']}={env.get('value', '')}")
    else:
        sys.exit(f"unknown verb {verb}")


if __name__ == "__main__":
    main()
