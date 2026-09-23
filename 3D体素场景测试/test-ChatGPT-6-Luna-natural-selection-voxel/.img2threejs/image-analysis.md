# Reference analysis — Natural Selection generation ship

## Suitability

The supplied image is a single poster-style three-quarter view of a hard-surface mechanical spacecraft. The ship is the clear target; it occupies most of the central/lower frame. Technical probe: PNG 762×1011, readable, but automated admission rejects it as a full-poster composite because it cannot isolate the ship silhouette from the dark background and overlaid graphics. Use it as qualitative visual guidance only, not a pixel/segmentation ground truth.

## Observations: macro → meso → micro

- **Macro silhouette:** A compound, roughly bilateral mechanical vessel with a long central keel, two broad orbital habitat rings, an elevated forward mast/deck, and three long blue aft exhaust forms. The single perspective foreshortens the rings and hides portions of the aft/underside.
- **Meso assemblies:** The bright habitat ring has a segmented shell and repeated radial braces. A second, darker blue/gray ring sits offset behind it. The central body is a layered axial spine that narrows at the nose. Three square-cased engines attach to the aft keel.
- **Micro features:** Repeated white hull plates, blue structural ribs, narrow orange service/hazard bands, dark recesses, small windows/ports, and cyan engine cores. Their exact dimensions and spacing are inferred from the one view.

## Spatial relationships

- Keel **supports** habitat rings through radial braces (embedded/overlap).
- Forward mast **attaches to** the keel above the ring assembly (overlap).
- Engine pods **attach to** the aft keel (socket/overlap); exhaust volumes extend aft from their nozzles.
- Exact unseen backside, interior volume, propellant plumbing, and ring support layout remain inferred.

## Material and color observations

- Main hull: warm off-white, mostly matte/satin painted metal.
- Structural ribs and underside: slate/blue-gray, matte painted metal.
- Service bands: saturated orange, satin painted metal.
- Engine shrouds: deep blue, satin painted metal; nozzle cores: luminous cyan-blue emissive.
- Dark areas are treated as recess/shadow cues, not asserted material color.

## Quality contract

- **Definition of done:** At least 2,000,000 unique occupied ship voxels are generated at runtime; hidden internal faces are not sent to the renderer; the visible ship remains readable as a three-dimensional ring-and-keel generation vessel from the hero and orbit views; core flight and camera interactions continue to work.
- **Required assemblies:** central keel, twin orbital habitat rings, radial braces, forward mast, three aft engine pods, emissive exhaust, hull markings and surface modules.
- **Detail distribution:** deterministic repeated cells; material variation follows structural regions; orange accents remain sparse; rings retain visible segmented ribs; no random speckling replaces the silhouette.
- **Views:** three-quarter hero, side/orbit angle, and front/ring angle. Because only one reference view exists, only the hero view is compared to the reference; other angles are checked for coherent volume.
- **Failure blockers:** fewer than 2,000,000 unique occupied cells; memory allocation failure; loss of hull silhouette; one or more engines/rings missing; browser render stalls or controls stop responding.
- **Approximation boundary:** single-view reconstruction; hidden side and internal layout are stylized inference, not exact source geometry.
