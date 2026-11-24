"""Extract four complete bone meshes from the licensed Open3DModel GLB."""

import argparse
import json
import struct
from pathlib import Path

NAMES = ("Femur.r", "Patella.r", "Tibia.r", "Fibula.r")
INDEX_BYTES = {5121: 1, 5123: 2, 5125: 4}
SOURCE = "https://ana3d.app/en/atlas/o3d-lower-limb/"
LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/"


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    if (magic, version, length) != (b"glTF", 2, len(data)):
        raise ValueError("Expected a glTF 2.0 binary.")
    size, kind = struct.unpack_from("<I4s", data, 12)
    binary_size, binary_kind = struct.unpack_from("<I4s", data, 20 + size)
    if kind != b"JSON" or binary_kind != b"BIN\0":
        raise ValueError("Expected JSON and binary chunks.")
    return json.loads(data[20:20 + size]), data[28 + size:28 + size + binary_size]


def subset(source, binary):
    result = {
        "asset": {"version": "2.0", "copyright": "Open3D project, Jan Kooloos, Eungyeol Lee et al.",
                  "extras": {"source": SOURCE, "license": LICENSE, "changes": "Four intact bone meshes selected."}},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(NAMES)))}],
        "extensionsUsed": ["KHR_mesh_quantization"],
        "extensionsRequired": ["KHR_mesh_quantization"],
        "materials": [source["materials"][0]],
        "accessors": [], "bufferViews": [], "nodes": [], "meshes": [],
    }
    output = bytearray()

    def copy_accessor(index, indices=False):
        accessor = dict(source["accessors"][index])
        view = dict(source["bufferViews"][accessor["bufferView"]])
        start, length = view.get("byteOffset", 0), view["byteLength"]
        if indices:
            start += accessor.get("byteOffset", 0)
            length = accessor["count"] * INDEX_BYTES[accessor["componentType"]]
            accessor["byteOffset"] = 0
        output.extend(b"\0" * (-len(output) % 4))
        view.update(byteOffset=len(output), byteLength=length)
        accessor["bufferView"] = len(result["bufferViews"])
        result["bufferViews"].append(view)
        result["accessors"].append(accessor)
        output.extend(binary[start:start + length])
        return len(result["accessors"]) - 1

    scene_nodes = {source["nodes"][index]["name"]: source["nodes"][index]
                   for index in source["scenes"][source["scene"]]["nodes"]}
    for name in NAMES:
        node = dict(scene_nodes[name])
        mesh = source["meshes"][node["mesh"]]
        original, = mesh["primitives"]
        primitive = dict(original)
        if primitive["material"] != 0 or primitive.get("extensions") or "children" in node:
            raise ValueError(f"Unexpected mesh layout for {name}.")
        primitive["attributes"] = {key: copy_accessor(value) for key, value in original["attributes"].items()}
        primitive["indices"] = copy_accessor(original["indices"], indices=True)
        node["mesh"] = len(result["meshes"])
        result["nodes"].append(node)
        result["meshes"].append({**mesh, "primitives": [primitive]})
    output.extend(b"\0" * (-len(output) % 4))
    result["buffers"] = [{"byteLength": len(output)}]
    return result, output


def encode_glb(document, binary):
    metadata = json.dumps(document, separators=(",", ":")).encode("utf-8")
    metadata += b" " * (-len(metadata) % 4)
    chunks = struct.pack("<I4s", len(metadata), b"JSON") + metadata
    chunks += struct.pack("<I4s", len(binary), b"BIN\0") + binary
    return struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encode_glb(*subset(*read_glb(args.source))))
