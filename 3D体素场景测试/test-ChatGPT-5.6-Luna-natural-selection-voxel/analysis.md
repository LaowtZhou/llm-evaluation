# Reference analysis — Natural Selection ship

## Layer 1 · Identification

The image contains one dominant mechanical spacecraft in a promotional poster composition. It is an elongated, bilateral mechanical object with a radial ring assembly, multiple rear engine units, hard-surface armor, and luminous exhaust. Primary domain: `object`. Confidence: 0.93. The surrounding text and nebula are scene context, not part of the physical object.

## Layer 2 · Overall form and silhouette

The craft is a long composite cuboid / tapered prism with a strong longitudinal axis. A large radial annulus intersects the central third of the axis. The rear terminates in multiple parallel engine pods that extend beyond the main hull. The reference uses a three-quarter rear view and a diagonal camera roll; the visible silhouette is not rotationally complete.

## Layer 3 · Macro → meso → micro

Macro assemblies:

- tapered forward command / sensor spine;
- central radial habitat ring;
- bridge and structural truss deck;
- rear power and propulsion block;
- four visible elongated engine pods;
- lateral armor / radiator wings.

Meso assemblies:

- white armor plates with dark recessed panel seams;
- orange structural collars around the ring and rear spine;
- ring inner rim and outer rim separated by a dark cavity;
- blue engine core housings and transparent exhaust rails;
- repeated fins, antenna towers, and box-like service modules.

Micro assemblies:

- repeated voxel-like panel blocks;
- small dark windows and vents;
- orange registration stripes;
- cyan-blue emissive engine cells;
- bright edge highlights and narrow linear panel gaps.

## Layer 4 · Spatial relationships

- `<central habitat ring, intersects, longitudinal spine>` with an embedded / socketed connection.
- `<rear propulsion block, attached-to, longitudinal spine>` with overlapping armor shells.
- `<engine pods, attached-to, rear propulsion block>` through parallel truss mounts.
- `<orange collars, wraps, ring and power junctions>` with flush contact.
- `<lateral radiator wings, extends-from, rear propulsion block>` with repeated rib attachment.
- `<blue exhaust rails, exits-from, engine pods>` along the longitudinal axis.

## Layer 5 · Materials and surface

- white armor: opaque metallic hard surface, medium-low roughness, chamfered edges.
- grey secondary armor: opaque metallic, higher roughness, darker albedo.
- graphite recesses: dark metallic cavities and panel seams.
- orange bands: anodized / painted metal with moderate roughness.
- blue cores: emissive translucent-looking energy volume; should remain readable as geometry and light, not only a flat glow.
- black space: image-based red/orange nebula under a dark vignette, with a layered procedural star field.

## Layer 6 · Color and finish

Dominant palette: near-black space, warm red-orange nebula, ivory white armor, cool grey secondary plates, saturated orange structural accents, vivid cyan/blue propulsion. The strongest contrast is the cool blue rear energy against warm orange structural light. Highlights are crisp around armor edges; emissive cores are saturated but not clipped.

## Layer 7 · Identity features

1. Large radial habitat ring around the midship axis.
2. Long white-grey central spine with multiple segmented armor fields.
3. Orange structural junctions at the ring and rear deck.
4. Multiple parallel blue propulsion cores with long rails / exhaust columns.
5. Rear three-quarter camera that exposes underside machinery.
6. White-grey hard-surface industrial construction rather than a smooth organic hull.
7. High-density small panel rhythm across the central deck.

## Layer 8 · Uncertainty and single-image limits

The front-facing underside, far side of the ring, and exact engine count are partly occluded. The reference does not prove hidden geometry or manufacturing dimensions. The web scene will use bilateral symmetry for hidden structure, mark the missing rear-side detail as procedural inference, and prioritize visual identity in the supplied three-quarter view.

## Implementation consequences

The model must be authored as a named hierarchy with separate instanced batches for hull, graphite recesses, orange structure, blue emissive cores, and micro-greebles. The camera contract is a rear three-quarter hero view with two non-degenerate orbit views for inspection. The scene should preserve the reference's diagonal energy while allowing the user to orbit the physical craft.
